import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createTournament, createTeam } from "../lib/services/tournament.service";
import { createAuction } from "../lib/services/auction.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
};

async function main() {
  const roster = await prisma.playerRoster.findFirstOrThrow({
    where: { name: "DefCat Test Roster" },
    include: { players: true },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

  await prisma.tournament.deleteMany({ where: { name: "DefCat Verify Tournament" } });

  const tournament = await createTournament({
    name: "DefCat Verify Tournament",
    rosterId: roster.id,
    numTeams: 2,
    squadSize: 3,
    startDate: new Date("2026-09-01"),
    endDate: new Date("2026-09-05"),
    createdById: admin.id,
  });
  await createTeam({ tournamentId: tournament.id, name: "Team A", managerOccupiesSlot: false });

  // Simulate the NewAuctionForm's client-side pre-fill logic in plain code:
  // categories created = ["Icon", "Regular"]; players auto-assigned to their defaultCategory
  // when it matches one of those names, and can be overridden.
  const categoryNames = ["Icon", "Regular"];
  const sachin = roster.players.find((p) => p.name === "Sachin Tendulkar")!;
  const zaheer = roster.players.find((p) => p.name === "Zaheer Khan")!;
  const yuvraj = roster.players.find((p) => p.name === "Yuvraj Singh")!;

  assert(sachin.defaultCategory === "Icon", "Sachin's roster default category is Icon");
  assert(zaheer.defaultCategory === "Regular", "Zaheer's roster default category is Regular");

  // Auto-fill: assignment = defaultCategory if it's in the currently-defined category list.
  const autoAssignments = roster.players
    .filter((p) => p.defaultCategory && categoryNames.includes(p.defaultCategory))
    .map((p) => ({ playerId: p.id, categoryName: p.defaultCategory! }));
  assert(autoAssignments.length === 3, "All 3 players auto-assigned since both categories exist");

  // Admin override: change Yuvraj from Icon -> Regular.
  const overridden = autoAssignments.map((a) =>
    a.playerId === yuvraj.id ? { ...a, categoryName: "Regular" } : a
  );

  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "DefCat Verify Auction",
    teamBudget: 1000,
    createdById: admin.id,
    categories: [
      { name: "Icon", basePrice: 300 },
      { name: "Regular", basePrice: 100 },
    ],
    playerAssignments: overridden,
  });

  const auctionPlayers = await prisma.auctionPlayer.findMany({
    where: { auctionId: auction.id },
    include: { player: true, category: true },
  });

  const sachinAp = auctionPlayers.find((ap) => ap.player.id === sachin.id)!;
  const zaheerAp = auctionPlayers.find((ap) => ap.player.id === zaheer.id)!;
  const yuvrajAp = auctionPlayers.find((ap) => ap.player.id === yuvraj.id)!;

  assert(sachinAp.category.name === "Icon", "Sachin kept default category Icon in the auction");
  assert(zaheerAp.category.name === "Regular", "Zaheer kept default category Regular in the auction");
  assert(yuvrajAp.category.name === "Regular", "Yuvraj's admin override (Icon -> Regular) was respected");

  console.log("\nAll default-category assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
