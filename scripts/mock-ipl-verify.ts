// Verifies both mock auctions end-to-end without a browser: status
// breakdowns, the exact gate app/manager/teams/[id]/analytics-v2/page.tsx
// checks, a real loadAuctionAnalyticsSnapshot + simulateAuctionRuns pass
// for KKR in each auction, and prints every mock login + its Analytics v2
// URL for a final visual spot-check.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadAuctionAnalyticsSnapshot } from "../lib/auction/analyticsAdapter";
import { isRunComplete, selfSquadPlayerIds, simulateAuctionRuns } from "../lib/auction-analytics/simulateAuction";
import { computeSimulationAggregateSummary } from "../lib/auction-analytics/simulationSummary";
import { computePlayerValueScores } from "../lib/auction-analytics/playerValue";
import { MEGA_AUCTION_NAME, MINI_AUCTION_NAME, MOCK_PASSWORD, TEAMS, TOURNAMENT_NAME } from "./mock-ipl-data";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "OK" : "FAIL"}: ${msg}`);
};

async function verifyAuction(auctionName: string) {
  console.log(`\n=== ${auctionName} ===`);
  const auction = await prisma.auction.findFirstOrThrow({ where: { name: auctionName } });
  assert(auction.status === "BIDDING", `status is BIDDING (got ${auction.status})`);

  const sold = await prisma.auctionPlayer.count({ where: { auctionId: auction.id, status: "SOLD" } });
  const available = await prisma.auctionPlayer.count({ where: { auctionId: auction.id, status: "AVAILABLE" } });
  console.log(`players: ${sold} SOLD, ${available} AVAILABLE`);

  const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id }, include: { team: true } });
  assert(entries.length === 10, `10 TeamAuctionEntry rows exist (got ${entries.length})`);
  for (const e of entries) {
    assert(e.analyticsEnabled === true, `${e.team.name}: analyticsEnabled is true`);
  }
  for (const e of entries) {
    console.log(`  ${e.team.name}: budgetRemaining=${e.budgetRemaining} slotsFilled=${e.slotsFilled}/${e.slotsTotal}`);
  }

  const kkrEntry = entries.find((e) => e.team.name === "Kolkata Knight Riders")!;
  const snapshot = await loadAuctionAnalyticsSnapshot(auction.id, kkrEntry.id);
  if (!snapshot) {
    console.log("FAIL: loadAuctionAnalyticsSnapshot returned null for KKR");
    return;
  }
  console.log(
    `KKR snapshot: players=${snapshot.players.length} sales=${snapshot.sales.length} wishlist=${snapshot.wishlist.length} ` +
      `predictions=${snapshot.predictions.length} rivalEstimates=${snapshot.rivalEstimates.length}`
  );
  assert(snapshot.wishlist.length > 0, "KKR has wishlist entries");
  assert(snapshot.predictions.length > 0, "KKR has predictions");
  assert(snapshot.rivalEstimates.length > 0, "KKR has rival estimates");

  const valueScores = computePlayerValueScores(snapshot.players);
  const runs = simulateAuctionRuns(snapshot, 20);
  const validRuns = runs.filter((r) => isRunComplete(snapshot, r));
  console.log(`Simulate: ${validRuns.length}/20 valid runs for KKR`);
  if (validRuns.length > 0) {
    const summary = computeSimulationAggregateSummary(snapshot, validRuns, valueScores);
    console.log(
      `  must-haves: ${summary.mustHaves.map((m) => `${m.playerId.slice(0, 6)}:${m.wonRunCount}/${summary.runCount}`).join(", ")}`
    );
    console.log(`  avg budget left: ${summary.budgetRemainingRange.avg.toFixed(0)}L`);
    const finalCounts = validRuns.map((r) => selfSquadPlayerIds(snapshot, r).length);
    console.log(`  final squad sizes across valid runs: ${finalCounts.join(", ")}`);
  }

  // Spot-check Punjab/LSG's pre-sold real-outcome must-haves resolve WON
  // (mega auction only — mini has no such scripted real-outcome sale).
  if (auctionName === MEGA_AUCTION_NAME) {
    for (const [teamName, playerName] of [
      ["Punjab Kings", "Shreyas Iyer"],
      ["Lucknow Super Giants", "Rishabh Pant"],
    ] as const) {
      const entry = entries.find((e) => e.team.name === teamName)!;
      const pref = await prisma.auctionPlayerPreference.findFirst({
        where: { teamAuctionEntryId: entry.id, auctionPlayer: { player: { name: playerName } } },
      });
      const sale = await prisma.auctionPlayer.findFirst({
        where: { auctionId: auction.id, player: { name: playerName }, status: "SOLD", soldToEntryId: entry.id },
      });
      assert(pref != null && sale != null, `${teamName}: must-have "${playerName}" is WON (pre-sold to itself)`);
    }
  }
}

async function main() {
  await verifyAuction(MEGA_AUCTION_NAME);
  await verifyAuction(MINI_AUCTION_NAME);

  console.log("\n=== Mock logins ===");
  for (const team of TEAMS) {
    const entryMega = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { team: { name: team.name }, auction: { name: MEGA_AUCTION_NAME } },
    });
    const entryMini = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { team: { name: team.name }, auction: { name: MINI_AUCTION_NAME } },
    });
    console.log(`${team.name}: manager-${team.slug}@mockipl.local / ${MOCK_PASSWORD}`);
    console.log(`  mega:  /manager/teams/${entryMega.id}/analytics-v2`);
    console.log(`  mini:  /manager/teams/${entryMini.id}/analytics-v2`);
  }
  console.log(`\nTournament: "${TOURNAMENT_NAME}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
