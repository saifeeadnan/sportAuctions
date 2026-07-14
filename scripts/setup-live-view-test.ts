import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "../lib/services/auction.service";
import { selectNextPlayer } from "../lib/services/bidding.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tournament = await prisma.tournament.findFirstOrThrow({
    where: { name: "Demo Tournament" },
    include: { roster: { include: { players: true } } },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: "Phase4 Live View Test" } });

  const players = tournament.roster.players;
  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "Phase4 Live View Test",
    teamBudget: 1000,
    createdById: admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });

  await openPreAuction(auction.id);
  await lockPreAuction(auction.id, true); // force lock, no one drafted anything
  await startBidding(auction.id);

  const firstPlayer = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, status: "AVAILABLE" },
  });
  await selectNextPlayer(auction.id, firstPlayer.id);

  const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 1" } },
  });

  console.log(`auctionId=${auction.id}`);
  console.log(`team1EntryId=${team1Entry.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
