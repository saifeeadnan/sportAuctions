// Foundation layer for the mock IPL tournament: league, 10 mock manager
// accounts, the ~230-player roster, the tournament, and the 10 teams (with
// their logos). Idempotent — safe to re-run; skips whatever already exists
// rather than rebuilding the 230-player roster every time (see the plan at
// C:\Users\adnan\.claude\plans\i-want-to-build-snazzy-noodle.md).
//
// Does NOT touch Auction/AuctionCategory/AuctionPlayer/TeamAuctionEntry —
// that's scripts/mock-ipl-auction-{mega,mini}.ts, which go through the
// service layer (lib/services/auction.service.ts etc.), never raw Prisma,
// matching every existing script/test in this repo.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { ANCHORS, LEAGUE_NAME, MOCK_PASSWORD, ROSTER_NAME, TEAMS, TOURNAMENT_NAME, SQUAD_SIZE, buildPlayerPool, ratingsForPlayer } from "./mock-ipl-data";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function fetchImageBytes(url: string): Promise<{ mimeType: string; data: Uint8Array<ArrayBuffer> } | null> {
  try {
    // A plain browser UA — the official team sites (behind their own
    // CDN/WAF) and Wikimedia both serve these reliably; a bare non-browser
    // UA string got Wikimedia 429-rate-limited for 9 of 10 teams earlier.
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" },
    });
    if (!res.ok) {
      console.warn(`  (logo fetch failed: ${res.status} ${url})`);
      return null;
    }
    const mimeType = res.headers.get("content-type") ?? "image/png";
    const data = new Uint8Array(await res.arrayBuffer());
    return { mimeType, data };
  } catch (e) {
    console.warn(`  (logo fetch error for ${url}: ${e instanceof Error ? e.message : e})`);
    return null;
  }
}

async function main() {
  let league = await prisma.league.findUnique({ where: { name: LEAGUE_NAME } });
  if (!league) {
    league = await prisma.league.create({ data: { name: LEAGUE_NAME, type: "Cricket" } });
    console.log(`Created league "${LEAGUE_NAME}"`);
  } else {
    console.log(`League "${LEAGUE_NAME}" already exists`);
  }

  // One mock manager User per team, each with a TEAM_MANAGER
  // LeagueMembership in this league — createTeam() (and the admin UI) both
  // require that membership to exist before a manager can be assigned.
  const managersBySlug = new Map<string, { id: string; loginId: string }>();
  const passwordHash = await bcrypt.hash(MOCK_PASSWORD, 10);
  for (const team of TEAMS) {
    const loginId = `manager-${team.slug}@mockipl.local`;
    const user = await prisma.user.upsert({
      where: { loginId },
      update: {},
      create: { loginId, name: `${team.name} Manager`, passwordHash, isSiteAdmin: false, isActive: true },
    });
    await prisma.leagueMembership.upsert({
      where: { userId_leagueId: { userId: user.id, leagueId: league.id } },
      update: {},
      create: { userId: user.id, leagueId: league.id, role: "TEAM_MANAGER", isActive: true },
    });
    managersBySlug.set(team.slug, user);
  }
  console.log(`${TEAMS.length} mock manager accounts ready (password: ${MOCK_PASSWORD})`);

  // Also need one admin actor for later scripts' service-layer calls
  // (createAuction's createdById, adminAssignPlayer's actorUserId, etc.).
  const adminLoginId = "admin-mockipl@mockipl.local";
  const adminPasswordHash = await bcrypt.hash(MOCK_PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { loginId: adminLoginId },
    update: {},
    create: { loginId: adminLoginId, name: "Mock IPL Admin", passwordHash: adminPasswordHash, isSiteAdmin: true, isActive: true },
  });
  console.log(`Admin account ready: ${adminLoginId} (password: ${MOCK_PASSWORD})`);

  let roster = await prisma.playerRoster.findFirst({ where: { name: ROSTER_NAME, leagueId: league.id } });
  if (!roster) {
    roster = await prisma.playerRoster.create({
      data: { name: ROSTER_NAME, createdById: admin.id, leagueId: league.id },
    });
    const pool = buildPlayerPool();
    await prisma.player.createMany({
      data: pool.map((p) => {
        const ratings = ratingsForPlayer(p.category, p.position);
        return {
          rosterId: roster!.id,
          name: p.name,
          position: p.position,
          defaultCategory: p.category,
          photoUrl: p.photoUrl ?? null,
          ...ratings,
        };
      }),
    });
    console.log(`Created roster "${ROSTER_NAME}" with ${pool.length} players`);
  } else {
    console.log(`Roster "${ROSTER_NAME}" already exists — not rebuilding`);
  }

  // Photo backfill — idempotent and separate from roster creation, same
  // reasoning as the team logo backfill below: lets ANCHORS' photoUrl
  // values be updated (e.g. re-sourced from a different site) without
  // requiring a full roster rebuild.
  for (const a of ANCHORS) {
    if (!a.photoUrl) continue;
    await prisma.player.updateMany({ where: { rosterId: roster.id, name: a.name }, data: { photoUrl: a.photoUrl } });
  }
  console.log(`Photo backfill: ${ANCHORS.filter((a) => a.photoUrl).length} named anchors updated`);

  let tournament = await prisma.tournament.findFirst({ where: { name: TOURNAMENT_NAME } });
  if (!tournament) {
    tournament = await prisma.tournament.create({
      data: {
        name: TOURNAMENT_NAME,
        rosterId: roster.id,
        leagueId: league.id,
        numTeams: TEAMS.length,
        squadSize: SQUAD_SIZE,
        startDate: new Date("2025-11-01"),
        endDate: new Date("2025-12-31"),
        createdById: admin.id,
      },
    });
    console.log(`Created tournament "${TOURNAMENT_NAME}"`);

    for (const team of TEAMS) {
      const manager = managersBySlug.get(team.slug)!;
      await prisma.team.create({
        data: {
          tournamentId: tournament.id,
          name: team.name,
          managerId: manager.id,
          managerOccupiesSlot: false,
        },
      });
    }
    console.log(`Created ${TEAMS.length} teams under "${TOURNAMENT_NAME}"`);
  } else {
    console.log(`Tournament "${TOURNAMENT_NAME}" already exists — not recreating teams`);
  }

  // Logo backfill — idempotent and separate from team creation, so a retry
  // after a rate-limited fetch doesn't require recreating anything.
  for (const team of TEAMS) {
    const dbTeam = await prisma.team.findFirstOrThrow({ where: { tournamentId: tournament.id, name: team.name } });
    const existingLogo = await prisma.teamSponsorImage.findUnique({ where: { teamId: dbTeam.id } });
    if (existingLogo) {
      console.log(`  ${team.name}: logo already present`);
      continue;
    }
    const logo = await fetchImageBytes(team.logoUrl);
    if (logo) {
      await prisma.teamSponsorImage.create({ data: { teamId: dbTeam.id, mimeType: logo.mimeType, data: logo.data } });
      console.log(`  ${team.name}: logo created`);
    } else {
      console.log(`  ${team.name}: logo fetch skipped/failed`);
    }
    // Wikimedia's CDN rate-limits bursts of cache-miss requests (429,
    // retry-after: 120) — space requests out to avoid tripping it.
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log("\nFoundation ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
