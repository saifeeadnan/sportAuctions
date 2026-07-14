import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "../lib/services/auction.service";
import { selectNextPlayer, recordSale } from "../lib/services/bidding.service";

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

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: "MinPrice Verify Auction" } });

  const players = tournament.roster.players;
  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "MinPrice Verify Auction",
    teamBudget: 5000,
    createdById: admin.id,
    categories: [{ name: "Regular", basePrice: 200 }],
    playerAssignments: players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });

  await openPreAuction(auction.id);
  await lockPreAuction(auction.id, true);
  await startBidding(auction.id);

  const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id, team: { name: "Team 1" } } });
  const target = await prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: auction.id, status: "AVAILABLE" } });

  await selectNextPlayer(auction.id, target.id);

  // Below base price (200) -> must be rejected
  try {
    await recordSale(auction.id, target.id, team1.id, 150);
    throw new Error("Expected recordSale to reject a bid below the category base price");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("base price"),
      `Bid of 150 below base price 200 is rejected: ${e instanceof Error ? e.message : e}`
    );
  }

  const stillAvailable = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: target.id } });
  assert(stillAvailable.status === "IN_BIDDING", "Player remains on the clock after rejected below-base bid (not sold)");

  // Exactly at base price -> must be accepted
  const result = await recordSale(auction.id, target.id, team1.id, 200);
  assert(result.player.status === "SOLD" && String(result.player.soldPrice) === "200", "Bid exactly at base price (200) is accepted");

  console.log("\nAll min-price assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
