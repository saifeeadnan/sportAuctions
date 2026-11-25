// Creates the ONE "IPL 2027 Mini Auction" — a team's existing roster
// (retentions + the 14 real Dec 2026 trades, ROSTER_PLAYERS) and the live
// open-auction pool (OPEN_POOL_PLAYERS, 76 real registered players) are the
// SAME squad, not two separate things, so both live in one Auction: the 26
// ROSTER_PLAYERS are admin-assigned (SOLD) at this auction's start — same
// real cost as before — and the 76 OPEN_POOL_PLAYERS are left AVAILABLE,
// zero pre-sold, matching reality that the real event hasn't happened yet.
// This way a team's slotsFilled/budgetRemaining correctly account for the
// players they already have before any live bidding starts.
//
// Idempotent: adds only missing Player rows on re-run; deletes-then-
// recreates this one named auction. Always goes through the service layer
// (never raw Prisma) for Auction/AuctionCategory/AuctionPlayer/
// TeamAuctionEntry writes, matching every other script here.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, startBiddingDirect } from "../lib/services/auction.service";
import { adminAssignPlayer } from "../lib/services/bidding.service";
import { setAnalyticsEnabled } from "../lib/services/auctionAnalyticsEntitlement.service";
import { MINI_AUCTION_CATEGORIES, MINI_AUCTION_NAME, OPEN_POOL_PLAYERS, ratingsForMiniAuctionTier, REAL_REMAINING_PURSE_LAKH, ROSTER_NAME, ROSTER_PLAYERS, TEAM_BUDGET, TEAMS, TOURNAMENT_NAME } from "./mock-ipl2027-data";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const tournament = await prisma.tournament.findFirstOrThrow({ where: { name: TOURNAMENT_NAME } });
  const roster = await prisma.playerRoster.findFirstOrThrow({ where: { name: ROSTER_NAME } });
  const admin = await prisma.user.findFirstOrThrow({ where: { isSiteAdmin: true } });

  const existingNames = new Set(
    (await prisma.player.findMany({ where: { rosterId: roster.id }, select: { name: true } })).map((p) => p.name)
  );
  const toCreate = OPEN_POOL_PLAYERS.filter((p) => !existingNames.has(p.name));
  if (toCreate.length > 0) {
    await prisma.player.createMany({
      data: toCreate.map((p) => {
        const ratings = ratingsForMiniAuctionTier(p.category, p.position);
        return { rosterId: roster.id, name: p.name, position: p.position, defaultCategory: p.category, photoUrl: null, ...ratings };
      }),
    });
  }
  console.log(`Added ${toCreate.length} new players to roster "${ROSTER_NAME}" (${OPEN_POOL_PLAYERS.length - toCreate.length} already present)`);

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: MINI_AUCTION_NAME } });

  const allPlayerNames = [...ROSTER_PLAYERS.map((p) => p.name), ...OPEN_POOL_PLAYERS.map((p) => p.name)];
  const auctionPlayers = await prisma.player.findMany({
    where: { rosterId: roster.id, name: { in: allPlayerNames } },
  });

  const auction = await createAuction({
    tournamentId: tournament.id,
    name: MINI_AUCTION_NAME,
    teamBudget: TEAM_BUDGET,
    createdById: admin.id,
    skipPreAuctionDraft: true,
    categories: MINI_AUCTION_CATEGORIES,
    playerAssignments: auctionPlayers.map((p) => ({ playerId: p.id, categoryName: p.defaultCategory! })),
  });
  console.log(`Created auction "${MINI_AUCTION_NAME}" (${auctionPlayers.length} players)`);

  await startBiddingDirect(auction.id, admin.id);

  const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id }, include: { team: true } });
  const entryBySlug = new Map(TEAMS.map((t) => [t.slug, entries.find((e) => e.team.name === t.name)!]));

  for (const p of ROSTER_PLAYERS) {
    const entry = entryBySlug.get(p.teamSlug)!;
    const auctionPlayer = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, player: { name: p.name }, status: "AVAILABLE" },
    });
    await adminAssignPlayer(auction.id, auctionPlayer.id, entry.id, p.costLakh, admin.id);
  }
  console.log(`Assigned ${ROSTER_PLAYERS.length} already-rostered real players to their current teams`);
  console.log(`Left ${OPEN_POOL_PLAYERS.length} real registered players AVAILABLE for live bidding`);

  for (const entry of entries) {
    await setAnalyticsEnabled(entry.id, true, admin.id);
  }
  console.log(`analyticsEnabled set for all ${entries.length} entries`);

  console.log("\nPer-team summary (slots already filled from the real roster vs. real reported remaining purse):");
  const refreshedEntries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id }, include: { team: true } });
  for (const team of TEAMS) {
    const entry = refreshedEntries.find((e) => e.team.name === team.name)!;
    const real = REAL_REMAINING_PURSE_LAKH[team.slug];
    console.log(
      `  ${team.name}: slotsFilled=${entry.slotsFilled}/${entry.slotsTotal}  mock budgetRemaining=${entry.budgetRemaining}L  real reported remaining purse=${real}L`
    );
  }

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
