import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "../lib/services/auction.service";
import { selectNextPlayer, recordSale } from "../lib/services/bidding.service";
import { getAuctionState } from "../lib/services/auctionState.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
};

async function sell(auctionId: string, playerName: string, teamEntryId: string, price: number) {
  const ap = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId, player: { name: playerName }, status: "AVAILABLE" },
  });
  await selectNextPlayer(auctionId, ap.id);
  await recordSale(auctionId, ap.id, teamEntryId, price);
  await new Promise((r) => setTimeout(r, 20)); // ensure distinct soldAt ordering
}

async function main() {
  const tournament = await prisma.tournament.findFirstOrThrow({
    where: { name: "Demo Tournament" },
    include: { roster: { include: { players: true } } },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: "SoldTicker Verify Auction" } });

  const players = tournament.roster.players;
  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "SoldTicker Verify Auction",
    teamBudget: 5000,
    createdById: admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });

  await openPreAuction(auction.id);
  await lockPreAuction(auction.id, true);
  await startBidding(auction.id);

  const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id, team: { name: "Team 1" } } });
  const team2 = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id, team: { name: "Team 2" } } });

  // Sell to Team 1 first (Axar Patel), then Team 2 (Hardik Pandya), then Team 1 again (Ishan Kishan).
  // Team 1's column, most-recent-first, should be: Ishan Kishan, then Axar Patel.
  await sell(auction.id, "Axar Patel", team1.id, 100);
  await sell(auction.id, "Hardik Pandya", team2.id, 100);
  await sell(auction.id, "Ishan Kishan", team1.id, 150);

  const state = await getAuctionState(auction.id);
  if (!state) throw new Error("state not found");

  const team1Sold = state.players
    .filter((p) => p.status === "SOLD" && p.soldToTeamName === "Team 1")
    .sort((a, b) => (b.soldAt! > a.soldAt! ? 1 : -1));

  console.log("Team 1 sold order (as computed for the table column):", team1Sold.map((p) => p.name));

  assert(team1Sold.length === 2, "Team 1 has 2 sold players");
  assert(team1Sold[0].name === "Ishan Kishan", "Most recently sold Team 1 player (Ishan Kishan) is first");
  assert(team1Sold[1].name === "Axar Patel", "Earlier-sold Team 1 player (Axar Patel) is second");
  assert(team1Sold.every((p) => p.soldAt !== null), "soldAt is populated on sold players");

  console.log("\nAll SoldTicker ordering assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
