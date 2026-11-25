// The "mini" mock auction: ~336-player pool, the SAME real pre-auction
// retention as the mega auction (a team's retained core doesn't change
// between auctions in the same season), KKR conserving hard early then set
// up to sweep cheap picks late (the payoff plays out live in Simulate, not
// pre-scripted), and two rival teams seeded as aggressive early spenders.
// Idempotent: deletes-then-recreates this one named auction.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, startBiddingDirect } from "../lib/services/auction.service";
import { adminAssignPlayer } from "../lib/services/bidding.service";
import { saveStrategy } from "../lib/services/auctionStrategy.service";
import { upsertRivalCategoryEstimate } from "../lib/services/rivalCategoryEstimate.service";
import { savePrediction } from "../lib/services/auctionPrediction.service";
import { setAnalyticsEnabled } from "../lib/services/auctionAnalyticsEntitlement.service";
import { CATEGORIES, GUARANTEED_MEGA_NAMES, MINI_AUCTION_NAME, RETAINED_NAMES, RETAINED_PLAYERS, TEAMS, TOURNAMENT_NAME } from "./mock-ipl-data";
import { mulberry32, randomlySellPlayers, splitPoolForAuctions } from "./mock-ipl-helpers";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Sized to comfortably cover the highest real-retention total (Rajasthan
// Royals, 7900L) with slack left for the scripted scenarios below — still
// notably smaller than mega's 12000L, so mini stays a leaner auction, not
// a same-scale rebuild.
const TEAM_BUDGET = 9000;

async function main() {
  const tournament = await prisma.tournament.findFirstOrThrow({
    where: { name: TOURNAMENT_NAME },
    include: { roster: { include: { players: true } } },
  });
  if (!tournament.roster) throw new Error(`${TOURNAMENT_NAME} has no roster attached`);
  const admin = await prisma.user.findFirstOrThrow({ where: { isSiteAdmin: true } });

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: MINI_AUCTION_NAME } });

  const { miniPool } = splitPoolForAuctions(tournament.roster.players, GUARANTEED_MEGA_NAMES, RETAINED_NAMES);

  const auction = await createAuction({
    tournamentId: tournament.id,
    name: MINI_AUCTION_NAME,
    teamBudget: TEAM_BUDGET,
    createdById: admin.id,
    skipPreAuctionDraft: true,
    categories: CATEGORIES.map((c) => ({ name: c.name, basePrice: c.basePrice, bidIncrement: c.bidIncrement })),
    playerAssignments: miniPool.map((p) => ({ playerId: p.id, categoryName: (p as { defaultCategory: string | null }).defaultCategory! })),
  });
  console.log(`Created auction "${MINI_AUCTION_NAME}" (${miniPool.length} players)`);

  await startBiddingDirect(auction.id, admin.id);

  const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id }, include: { team: true } });
  const entryByTeamName = new Map(entries.map((e) => [e.team.name, e]));
  const entryBySlug = new Map(TEAMS.map((t) => [t.slug, entryByTeamName.get(t.name)!]));

  const dbCategories = await prisma.auctionCategory.findMany({ where: { auctionId: auction.id } });
  const categoryIdByName = new Map(dbCategories.map((c) => [c.name, c.id]));

  // --- Every team's real pre-auction retention, at the same real cost as
  // the mega auction — a team's retained core doesn't change between
  // auctions in the same season. ---
  for (const r of RETAINED_PLAYERS) {
    const entry = entryBySlug.get(r.teamSlug)!;
    const auctionPlayer = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, player: { name: r.name }, status: "AVAILABLE" },
    });
    await adminAssignPlayer(auction.id, auctionPlayer.id, entry.id, r.costLakh, admin.id);
  }
  console.log(`Retention: ${RETAINED_PLAYERS.length} players assigned to their real 2025 teams`);

  const rng = mulberry32(99100);
  const kkrEntry = entryBySlug.get("kkr")!;

  // --- KKR conserves hard: 2 cheap picks (10% filled) on top of its own
  // retention ---
  for (let i = 0; i < 2; i++) {
    const candidate = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, status: "AVAILABLE", category: { name: { in: ["D-Tier", "E-Tier", "Uncapped"] } } },
    });
    await adminAssignPlayer(auction.id, candidate.id, kkrEntry.id, 100, admin.id);
  }
  const kkrAfterConserve = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: kkrEntry.id } });
  console.log(`KKR: 2 conservative picks at 100L each (budgetRemaining now ${kkrAfterConserve.budgetRemaining}L)`);

  // --- Two rival teams seeded as aggressive early spenders (50% filled) ---
  for (const slug of ["mi", "csk"]) {
    const entry = entryBySlug.get(slug)!;
    const sold = await randomlySellPlayers(prisma, auction.id, entry.id, admin.id, 10, rng, { maxMultiplier: 2.2 });
    console.log(`${slug.toUpperCase()} (aggressive spender): ${sold} sales`);
  }

  // --- The other 7 rivals get modest generic fill (20% filled) ---
  for (const slug of ["rcb", "dc", "pbks", "rr", "srh", "lsg", "gt"]) {
    const entry = entryBySlug.get(slug)!;
    const sold = await randomlySellPlayers(prisma, auction.id, entry.id, admin.id, 4, rng);
    console.log(`${slug.toUpperCase()}: ${sold} generic sales`);
  }

  // --- KKR's own must-haves (the sweep targets), avoids, budget targets,
  // rival estimates, and predictions — picked from whatever's still
  // AVAILABLE now that the fills above are done. ---
  const sweepTargets = await prisma.auctionPlayer.findMany({
    where: { auctionId: auction.id, status: "AVAILABLE", category: { name: { in: ["C-Tier", "D-Tier", "E-Tier"] } } },
    take: 3,
  });
  const avoids = await prisma.auctionPlayer.findMany({
    where: { auctionId: auction.id, status: "AVAILABLE", id: { notIn: sweepTargets.map((p) => p.id) } },
    take: 2,
  });
  await saveStrategy(
    kkrEntry.id,
    sweepTargets.map((p) => p.id),
    avoids.map((p) => p.id),
    [], // budget targets deliberately generous/absent — fairShareBound's slack does the work
    admin.id
  );
  console.log(`KKR: strategy saved (${sweepTargets.length} sweep must-haves, ${avoids.length} avoids)`);

  const miEntry = entryBySlug.get("mi")!;
  const cskEntry = entryBySlug.get("csk")!;
  const [miSpend, cskSpend] = await Promise.all([
    prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: miEntry.id } }),
    prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: cskEntry.id } }),
  ]);
  // Estimate each aggressive rival near what they've already spent in a
  // couple of categories — Simulate then excludes them from contesting
  // once reached, clearing KKR's path to the sweep.
  await upsertRivalCategoryEstimate(kkrEntry.id, miEntry.id, categoryIdByName.get("C-Tier")!, (TEAM_BUDGET - Number(miSpend.budgetRemaining)) / 3, admin.id);
  await upsertRivalCategoryEstimate(kkrEntry.id, cskEntry.id, categoryIdByName.get("D-Tier")!, (TEAM_BUDGET - Number(cskSpend.budgetRemaining)) / 3, admin.id);
  console.log("KKR: rival estimates saved (MI, CSK — the two aggressive spenders)");

  const predictionTargets = await prisma.auctionPlayer.findMany({
    where: { auctionId: auction.id, status: "AVAILABLE", id: { notIn: [...sweepTargets, ...avoids].map((p) => p.id) } },
    take: 3,
  });
  if (predictionTargets.length >= 3) {
    await savePrediction(kkrEntry.id, predictionTargets[0].id, miEntry.id, 200, null, false, admin.id); // team+amount
    await savePrediction(kkrEntry.id, predictionTargets[1].id, null, 90, null, false, admin.id); // price-only
    await savePrediction(kkrEntry.id, predictionTargets[2].id, null, 150, 80, false, admin.id); // min+max
    console.log("KKR: 3 predictions saved (team+amount, price-only, min+max)");
  }

  for (const entry of entries) {
    await setAnalyticsEnabled(entry.id, true, admin.id);
  }
  console.log("analyticsEnabled set for all 10 entries");

  console.log(`\nMini auction ready. auctionId=${auction.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
