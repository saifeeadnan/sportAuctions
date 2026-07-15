import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, openPreAuction } from "../lib/services/auction.service";
import { adminAssignPlayer } from "../lib/services/bidding.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

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

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: "AdminAssign Verify Auction" } });
  const players = tournament.roster.players;
  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "AdminAssign Verify Auction",
    teamBudget: 2000,
    createdById: admin.id,
    categories: [{ name: "Icon", basePrice: 300 }, { name: "Regular", basePrice: 100 }],
    playerAssignments: players.map((p, i) => ({
      playerId: p.id,
      categoryName: i < 5 ? "Icon" : "Regular",
    })),
  });

  // Cannot assign before pre-auction opens.
  const anyPlayer = await prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: auction.id } });
  const team1Pre = await prisma.team.findFirstOrThrow({ where: { tournamentId: tournament.id, name: "Team 1" } });
  try {
    await adminAssignPlayer(auction.id, anyPlayer.id, "nonexistent-entry", 100);
    throw new Error("Expected adminAssignPlayer to reject before pre-auction opens");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("Open pre-auction"),
      `Assignment blocked before pre-auction opens: ${e instanceof Error ? e.message : e}`
    );
  }

  await openPreAuction(auction.id);

  const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, teamId: team1Pre.id },
  });
  const team2Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 2" } },
  });

  const iconPlayer = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, category: { name: "Icon" } },
    include: { player: true },
  });

  // Below base price -> rejected.
  try {
    await adminAssignPlayer(auction.id, iconPlayer.id, team1Entry.id, 200);
    throw new Error("Expected adminAssignPlayer to reject a price below the category base price");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("base price"),
      `Below-base-price assignment rejected: ${e instanceof Error ? e.message : e}`
    );
  }

  // Valid assignment at exactly the base price.
  const result = await adminAssignPlayer(auction.id, iconPlayer.id, team1Entry.id, 300);
  assert(result.player.status === "SOLD" && result.player.soldVia === "ADMIN_ASSIGNED", "Player marked SOLD via ADMIN_ASSIGNED");
  assert(String(result.entry.budgetRemaining) === "1650", `Team 1 budgetRemaining is 2000 - 50 (manager) - 300 = 1650, got ${result.entry.budgetRemaining}`);
  assert(result.entry.slotsFilled === 2, `Team 1 slotsFilled is 2 (manager + assigned player), got ${result.entry.slotsFilled}`);

  // Already-SOLD player cannot be assigned again.
  try {
    await adminAssignPlayer(auction.id, iconPlayer.id, team2Entry.id, 300);
    throw new Error("Expected adminAssignPlayer to reject an already-SOLD player");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("cannot be directly assigned"),
      `Re-assigning an already-sold player is rejected: ${e instanceof Error ? e.message : e}`
    );
  }

  // The assigned player must no longer appear in the manager's draftable pool.
  const stillAvailableForDraft = await prisma.auctionPlayer.findFirst({
    where: { auctionId: auction.id, id: iconPlayer.id, status: "AVAILABLE" },
  });
  assert(stillAvailableForDraft === null, "Assigned player no longer appears as AVAILABLE (excluded from draft/auction pool)");

  console.log("\nAll admin-assign-player assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
