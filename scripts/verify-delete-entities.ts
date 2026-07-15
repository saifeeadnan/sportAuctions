import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createTournament, createTeam, deleteTournament } from "../lib/services/tournament.service";
import { createAuction, openPreAuction, startBidding, deleteAuction, lockPreAuction } from "../lib/services/auction.service";
import { deleteUser } from "../lib/services/user.service";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
};

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const roster = await prisma.playerRoster.findFirstOrThrow({ where: { name: "Demo Season Roster" } });

  // --- Tournament deletion ---
  await prisma.tournament.deleteMany({ where: { name: "Deletable Test Tournament" } });
  const tournament = await createTournament({
    name: "Deletable Test Tournament",
    rosterId: roster.id,
    numTeams: 2,
    squadSize: 3,
    startDate: new Date("2026-10-01"),
    endDate: new Date("2026-10-05"),
    createdById: admin.id,
  });
  await createTeam({ tournamentId: tournament.id, name: "T1", managerOccupiesSlot: false });

  const players = await prisma.player.findMany({ where: { rosterId: roster.id }, take: 3 });
  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "Deletable Test Auction",
    teamBudget: 500,
    createdById: admin.id,
    categories: [{ name: "Regular", basePrice: 50 }],
    playerAssignments: players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });

  // Cannot delete tournament while an auction under it is BIDDING.
  await openPreAuction(auction.id);
  await lockPreAuction(auction.id, true);
  await startBidding(auction.id);

  try {
    await deleteTournament(tournament.id);
    throw new Error("Expected deleteTournament to reject while an auction is BIDDING");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("in progress"),
      `Tournament deletion blocked while auction is live: ${e instanceof Error ? e.message : e}`
    );
  }

  // Auction deletion should also be blocked while BIDDING.
  try {
    await deleteAuction(auction.id);
    throw new Error("Expected deleteAuction to reject a BIDDING auction");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("in progress"),
      `Auction deletion blocked while BIDDING: ${e instanceof Error ? e.message : e}`
    );
  }

  // Conclude via direct status flip isn't available without concludeAuction (needs a player on clock);
  // just directly set status back to CREATED-equivalent by deleting after forcing COMPLETED via prisma for test purposes.
  await prisma.auction.update({ where: { id: auction.id }, data: { status: "COMPLETED" } });

  await deleteAuction(auction.id);
  const auctionGone = await prisma.auction.findUnique({ where: { id: auction.id } });
  assert(auctionGone === null, "Auction deleted successfully once no longer BIDDING");

  await deleteTournament(tournament.id);
  const tournamentGone = await prisma.tournament.findUnique({ where: { id: tournament.id } });
  assert(tournamentGone === null, "Tournament deleted successfully after its auction was removed");
  const teamsGone = await prisma.team.count({ where: { tournamentId: tournament.id } });
  assert(teamsGone === 0, "Teams cascade-deleted with the tournament");

  // --- User deletion ---
  const passwordHash = await bcrypt.hash("test123", 10);
  await prisma.user.deleteMany({ where: { loginId: "deletable-viewer@sportsauction.local" } });
  const viewer = await prisma.user.create({
    data: { loginId: "deletable-viewer@sportsauction.local", name: "Deletable Viewer", role: "VIEWER", passwordHash },
  });

  await deleteUser(viewer.id, admin.id);
  const viewerGone = await prisma.user.findUnique({ where: { id: viewer.id } });
  assert(viewerGone === null, "Unattached viewer user deleted successfully");

  // Cannot delete self.
  try {
    await deleteUser(admin.id, admin.id);
    throw new Error("Expected deleteUser to reject self-deletion");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("own account"),
      `Self-deletion blocked: ${e instanceof Error ? e.message : e}`
    );
  }

  // Cannot delete a user who created rosters/tournaments/etc (admin has created things).
  try {
    const otherAdmin = await prisma.user.create({
      data: { loginId: "throwaway-check@sportsauction.local", name: "Throwaway", role: "ADMIN", passwordHash },
    });
    await deleteUser(admin.id, otherAdmin.id);
    throw new Error("Expected deleteUser to reject deleting a user with linked records");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("Cannot delete"),
      `Deleting a user with linked rosters/tournaments is blocked: ${e instanceof Error ? e.message : e}`
    );
  } finally {
    await prisma.user.deleteMany({ where: { loginId: "throwaway-check@sportsauction.local" } });
  }

  console.log("\nAll delete-entities assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
