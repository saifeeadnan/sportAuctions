// Foundation layer for the "IPL 2027 Mock Season" — a NEW roster/tournament/
// teams under the SAME league and SAME 10 manager accounts the 2025-cycle
// mock already created (scripts/mock-ipl-foundation.ts), so logins stay
// consistent across both mock cycles. Does NOT touch the 2025 tournament,
// its roster, or its teams — this is a separate tournament because the real
// Dec 2026 trades move specific named players between teams, which would
// conflict with the already-locked 2025 mock rosters if bolted on instead.
//
// Idempotent — safe to re-run; skips whatever already exists.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { LEAGUE_NAME } from "./mock-ipl-data";
import { ratingsForMiniAuctionTier, ROSTER_NAME, ROSTER_PLAYERS, SQUAD_SIZE, TEAMS, TOURNAMENT_NAME } from "./mock-ipl2027-data";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Same fetch helper as scripts/mock-ipl-foundation.ts (not exported from
// there, so duplicated rather than reaching into another script's private
// internals) — logos are per-Team, not shared across tournaments, so this
// new tournament's Team rows need their own TeamSponsorImage rows even
// though they reuse the same real logoUrl values from TEAMS.
async function fetchImageBytes(url: string): Promise<{ mimeType: string; data: Uint8Array<ArrayBuffer> } | null> {
  try {
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
  const league = await prisma.league.findUniqueOrThrow({ where: { name: LEAGUE_NAME } });
  const admin = await prisma.user.findFirstOrThrow({ where: { isSiteAdmin: true } });

  const managersBySlug = new Map<string, { id: string }>();
  for (const team of TEAMS) {
    const loginId = `manager-${team.slug}@mockipl.local`;
    const manager = await prisma.user.findUniqueOrThrow({ where: { loginId } });
    managersBySlug.set(team.slug, manager);
  }
  console.log(`Reusing league "${LEAGUE_NAME}" and its ${TEAMS.length} existing mock manager accounts`);

  let roster = await prisma.playerRoster.findFirst({ where: { name: ROSTER_NAME, leagueId: league.id } });
  if (!roster) {
    roster = await prisma.playerRoster.create({
      data: { name: ROSTER_NAME, createdById: admin.id, leagueId: league.id },
    });
    await prisma.player.createMany({
      data: ROSTER_PLAYERS.map((p) => {
        const ratings = ratingsForMiniAuctionTier(p.category, p.position);
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
    console.log(`Created roster "${ROSTER_NAME}" with ${ROSTER_PLAYERS.length} players`);
  } else {
    console.log(`Roster "${ROSTER_NAME}" already exists — not rebuilding`);
  }

  // Add-missing-players backfill — idempotent and separate from roster
  // creation, so ROSTER_PLAYERS entries added after the roster already
  // exists (e.g. this session's retention-list completeness fix) still get
  // created without a full roster rebuild.
  const existingPlayerNames = new Set(
    (await prisma.player.findMany({ where: { rosterId: roster.id }, select: { name: true } })).map((p) => p.name)
  );
  const missingRosterPlayers = ROSTER_PLAYERS.filter((p) => !existingPlayerNames.has(p.name));
  if (missingRosterPlayers.length > 0) {
    await prisma.player.createMany({
      data: missingRosterPlayers.map((p) => {
        const ratings = ratingsForMiniAuctionTier(p.category, p.position);
        return { rosterId: roster.id, name: p.name, position: p.position, defaultCategory: p.category, photoUrl: p.photoUrl ?? null, ...ratings };
      }),
    });
  }
  console.log(`Added ${missingRosterPlayers.length} missing roster players (${ROSTER_PLAYERS.length - missingRosterPlayers.length} already present)`);

  // Photo backfill — idempotent and separate from roster creation, so a
  // photoUrl added/changed in ROSTER_PLAYERS after the roster already exists
  // still takes effect without a full rebuild.
  for (const p of ROSTER_PLAYERS) {
    if (!p.photoUrl) continue;
    await prisma.player.updateMany({ where: { rosterId: roster.id, name: p.name }, data: { photoUrl: p.photoUrl } });
  }
  console.log(`Photo backfill: ${ROSTER_PLAYERS.filter((p) => p.photoUrl).length} players updated`);

  let tournament = await prisma.tournament.findFirst({ where: { name: TOURNAMENT_NAME } });
  if (!tournament) {
    tournament = await prisma.tournament.create({
      data: {
        name: TOURNAMENT_NAME,
        rosterId: roster.id,
        leagueId: league.id,
        numTeams: TEAMS.length,
        squadSize: SQUAD_SIZE,
        startDate: new Date("2026-12-16"),
        endDate: new Date("2027-05-31"),
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
