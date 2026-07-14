import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "../lib/services/auction.service";
import { selectNextPlayer, recordSale, markUnsold } from "../lib/services/bidding.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
};

async function main() {
  const tournament = await prisma.tournament.findFirstOrThrow({
    where: { name: "Demo Tournament" },
    include: { roster: { include: { players: true } } },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: "Reoffer Verify Auction" } });

  const players = tournament.roster.players;
  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "Reoffer Verify Auction",
    teamBudget: 2000,
    createdById: admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });

  await openPreAuction(auction.id);
  await lockPreAuction(auction.id, true);
  await startBidding(auction.id);

  const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id, team: { name: "Team 1" } } });
  const target = await prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: auction.id, status: "AVAILABLE" }, include: { player: true } });

  // Round 1: put on clock, mark unsold.
  await selectNextPlayer(auction.id, target.id);
  await markUnsold(auction.id, target.id);

  let refreshed = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: target.id } });
  assert(refreshed.status === "UNSOLD", `${target.player.name} is UNSOLD after first pass`);

  // Round 2: re-offer the same unsold player -> should be allowed to go back on the clock.
  await selectNextPlayer(auction.id, target.id);
  refreshed = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: target.id } });
  assert(refreshed.status === "IN_BIDDING", `${target.player.name} can be put back on the clock from UNSOLD`);

  // This time, sell it.
  const result = await recordSale(auction.id, target.id, team1.id, 120);
  assert(result.player.status === "SOLD" && result.player.soldVia === "LIVE_BID", `${target.player.name} sold on re-offer`);
  assert(String(result.player.soldPrice) === "120", "Sold at the re-offer bid price (120)");

  // A currently-UNSOLD player should NOT be selectable a third time now that it's SOLD.
  try {
    await selectNextPlayer(auction.id, target.id);
    throw new Error("Expected selectNextPlayer to reject a SOLD player");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("cannot be put on the clock"),
      `Cannot re-offer a player that is already SOLD: ${e instanceof Error ? e.message : e}`
    );
  }

  console.log("\nAll unsold re-offer assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
