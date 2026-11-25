// Verifies the unified "IPL 2027 Mini Auction" without a browser: confirms
// every confirmed real player (retained/traded) landed on the correct team
// at the documented cost, confirms the 76 real registered players are
// AVAILABLE for live bidding, confirms slotsFilled/analyticsEnabled per
// team, and prints every mock login + its Analytics v2 URL for a final
// visual spot-check.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MOCK_PASSWORD } from "./mock-ipl-data";
import { MINI_AUCTION_NAME, OPEN_POOL_PLAYERS, ROSTER_PLAYERS, TEAMS, TOURNAMENT_NAME } from "./mock-ipl2027-data";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "OK" : "FAIL"}: ${msg}`);
};

async function main() {
  const auction = await prisma.auction.findFirstOrThrow({ where: { name: MINI_AUCTION_NAME } });
  assert(auction.status === "BIDDING", `status is BIDDING (got ${auction.status})`);

  const sold = await prisma.auctionPlayer.count({ where: { auctionId: auction.id, status: "SOLD" } });
  const available = await prisma.auctionPlayer.count({ where: { auctionId: auction.id, status: "AVAILABLE" } });
  assert(sold === ROSTER_PLAYERS.length, `${ROSTER_PLAYERS.length} already-rostered players SOLD (got ${sold})`);
  assert(
    available === OPEN_POOL_PLAYERS.length,
    `${OPEN_POOL_PLAYERS.length} real registered players AVAILABLE for live bidding (got ${available})`
  );

  const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id }, include: { team: true } });
  assert(entries.length === 10, `10 TeamAuctionEntry rows exist (got ${entries.length})`);
  for (const e of entries) {
    assert(e.analyticsEnabled === true, `${e.team.name}: analyticsEnabled is true`);
  }

  console.log("\nSlots already filled per team (reflects their real current roster, not just this live auction's sales):");
  for (const e of entries) {
    console.log(`  ${e.team.name}: slotsFilled=${e.slotsFilled}/${e.slotsTotal}  budgetRemaining=${e.budgetRemaining}L`);
  }

  console.log("\nSpot-checking every confirmed real player landed on the right team at the right cost:");
  for (const p of ROSTER_PLAYERS) {
    const entry = entries.find((e) => e.team.name === TEAMS.find((t) => t.slug === p.teamSlug)!.name)!;
    const row = await prisma.auctionPlayer.findFirst({
      where: { auctionId: auction.id, player: { name: p.name }, status: "SOLD", soldToEntryId: entry.id },
    });
    const costMatches = row != null && Number(row.soldPrice) === p.costLakh;
    assert(costMatches, `${p.name} -> ${entry.team.name} at ${p.costLakh}L (${p.source}${p.tradedFrom ? ` from ${p.tradedFrom}` : ""})`);
  }

  console.log("\n=== Mock logins ===");
  for (const team of TEAMS) {
    const entry = entries.find((e) => e.team.name === team.name)!;
    console.log(`${team.name}: manager-${team.slug}@mockipl.local / ${MOCK_PASSWORD}`);
    console.log(`  roster:   /manager/team/${entry.teamId}`);
    console.log(`  live:     /manager/teams/${entry.id}/analytics-v2`);
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
