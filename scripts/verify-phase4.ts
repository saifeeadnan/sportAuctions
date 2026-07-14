import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { startBidding } from "../lib/services/auction.service";
import {
  selectNextPlayer,
  recordSale,
  markUnsold,
  concludeAuction,
} from "../lib/services/bidding.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
};

async function main() {
  const auction = await prisma.auction.findFirstOrThrow({
    where: { name: "Phase3 Verify Auction" },
  });

  await startBidding(auction.id);
  console.log("Started bidding");

  const contested = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, status: "IN_PRE_AUCTION_POOL" },
    include: { player: true },
  });
  console.log(`Contested player on the clock: ${contested.player.name}`);

  await selectNextPlayer(auction.id, contested.id);

  const onClock = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: contested.id } });
  assert(onClock.status === "IN_BIDDING", "Contested player is IN_BIDDING after selectNextPlayer");

  // Attempt to select a second player while one is on the clock -> should fail
  const anotherAvailable = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, status: "AVAILABLE" },
  });
  try {
    await selectNextPlayer(auction.id, anotherAvailable.id);
    throw new Error("Expected selectNextPlayer to reject a second concurrent on-clock player");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("already on the clock"),
      "Cannot put a second player on the clock while one is active"
    );
  }

  const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 1" } },
  });
  console.log(`Team 1 budgetRemaining before bid: ${team1Entry.budgetRemaining}, slots ${team1Entry.slotsFilled}/${team1Entry.slotsTotal}`);

  // Reserve-rule violation attempt: bid that would leave too little for remaining slots.
  // Team1 has budgetRemaining=1450, slotsFilled=2, slotsTotal=5 -> 3 slots remain after this pick would be 2.
  // reserveUnit = min(category basePrice) = 100. Need budgetAfter >= 2*100=200. Bid 1300 leaves 150 remaining -> violates (150 < 200).
  try {
    await recordSale(auction.id, contested.id, team1Entry.id, 1300);
    throw new Error("Expected recordSale to reject a bid that violates the reserve rule");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("must keep at least"),
      `Reserve rule rejects an overly large bid (1300): ${e instanceof Error ? e.message : e}`
    );
  }

  // A valid bid within reserve rule: 200 leaves 1250 remaining, need >= 2*100=200 -> ok
  const result = await recordSale(auction.id, contested.id, team1Entry.id, 200);
  assert(result.player.status === "SOLD" && result.player.soldVia === "LIVE_BID", "Contested player sold via live bid");
  assert(String(result.entry.budgetRemaining) === "1250", `Team 1 budgetRemaining is 1250 after winning bid, got ${result.entry.budgetRemaining}`);
  assert(result.entry.slotsFilled === 3, `Team 1 slotsFilled is 3, got ${result.entry.slotsFilled}`);

  // Mark an available player unsold via the on-clock flow
  const nextPlayer = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, status: "AVAILABLE" },
    include: { player: true },
  });
  await selectNextPlayer(auction.id, nextPlayer.id);
  await markUnsold(auction.id, nextPlayer.id);
  const unsoldCheck = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: nextPlayer.id } });
  assert(unsoldCheck.status === "UNSOLD", `${nextPlayer.player.name} marked UNSOLD`);

  // Conclude the auction; remaining players should become unsold, entries FINAL
  await concludeAuction(auction.id);
  const finalAuction = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
  assert(finalAuction.status === "COMPLETED", "Auction status is COMPLETED");

  const remaining = await prisma.auctionPlayer.findMany({
    where: { auctionId: auction.id, status: { in: ["AVAILABLE", "IN_PRE_AUCTION_POOL", "IN_BIDDING"] } },
  });
  assert(remaining.length === 0, "No players remain in AVAILABLE/IN_PRE_AUCTION_POOL/IN_BIDDING after conclusion");

  const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id } });
  assert(entries.every((e) => e.status === "FINAL"), "All team entries are FINAL after conclusion");

  // Budget reconciliation check
  const team1Final = await prisma.teamAuctionEntry.findUniqueOrThrow({
    where: { id: team1Entry.id },
    include: { team: true, playersWon: true },
  });
  const soldSum = team1Final.playersWon.reduce((sum, p) => sum + Number(p.soldPrice ?? 0), 0);
  const managerPrice = 50;
  const expectedRemaining = 2000 - managerPrice - soldSum;
  assert(
    Number(team1Final.budgetRemaining) === expectedRemaining,
    `Team 1 budget reconciles: 2000 - ${managerPrice} - ${soldSum} = ${expectedRemaining}, got ${team1Final.budgetRemaining}`
  );

  console.log("\nAll Phase 4 assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
