import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, openPreAuction, lockPreAuction } from "../lib/services/auction.service";
import { submitDraft } from "../lib/services/preAuctionDraft.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
};

async function main() {
  const tournament = await prisma.tournament.findFirstOrThrow({
    where: { name: "Demo Tournament" },
    include: { roster: { include: { players: true } }, teams: { include: { manager: true } } },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

  // Team 1 / manager1 is self-matched to "Virat Kohli"; Team 2 / manager2 is NOT self-matched.
  const team1 = tournament.teams.find((t) => t.name === "Team 1")!;
  const team2 = tournament.teams.find((t) => t.name === "Team 2")!;
  const virat = tournament.roster.players.find((p) => p.name === "Virat Kohli")!;
  const viratOriginalLoginId = virat.loginId;
  await prisma.player.update({ where: { id: virat.id }, data: { loginId: team1.manager!.loginId } });

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: "MergedSlot Verify Auction" } });
  const players = tournament.roster.players;
  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "MergedSlot Verify Auction",
    teamBudget: 2000,
    createdById: admin.id,
    categories: [{ name: "Icon", basePrice: 300 }, { name: "Regular", basePrice: 100 }],
    playerAssignments: players.map((p) => ({
      playerId: p.id,
      categoryName: p.name === "Virat Kohli" ? "Icon" : "Regular",
    })),
  });

  await openPreAuction(auction.id);

  const entry1 = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, teamId: team1.id },
  });
  const entry2 = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, teamId: team2.id },
  });

  // Team 1 (self-matched manager): no manager fee deducted, slotsFilled starts at 0.
  assert(entry1.slotsFilled === 0, `Team 1 (self-matched) slotsFilled starts at 0, got ${entry1.slotsFilled}`);
  assert(
    String(entry1.budgetRemaining) === "2000",
    `Team 1 budgetRemaining starts at full 2000 (no manager fee), got ${entry1.budgetRemaining}`
  );

  // Team 2 (not self-matched): normal manager-fee slot still applies.
  assert(entry2.slotsFilled === 1, `Team 2 (not self-matched) slotsFilled starts at 1, got ${entry2.slotsFilled}`);
  assert(
    String(entry2.budgetRemaining) === "1950",
    `Team 2 budgetRemaining is 2000 - 50 (manager fee) = 1950, got ${entry2.budgetRemaining}`
  );

  const cap1 = entry1.slotsTotal - entry1.slotsFilled;
  assert(cap1 === 5, `Team 1's remaining cap is the full squad size (5), got ${cap1}`);

  // Submit Team 1's draft with ONLY the self-locked pick (Virat Kohli / manager1).
  const viratAp = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: virat.id },
  });
  await submitDraft(entry1.id, [viratAp.id]);

  await lockPreAuction(auction.id, true);

  const finalEntry1 = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: entry1.id } });
  assert(finalEntry1.slotsFilled === 1, `After resolution, Team 1 has exactly 1 slot filled (the self pick), got ${finalEntry1.slotsFilled}`);
  assert(
    String(finalEntry1.budgetRemaining) === "1700",
    `Team 1 budgetRemaining is 2000 - 300 (Icon base price for self pick) = 1700, got ${finalEntry1.budgetRemaining}`
  );

  const finalRemainingCap1 = finalEntry1.slotsTotal - finalEntry1.slotsFilled;
  assert(finalRemainingCap1 === 4, `Team 1 has 4 slots remaining after the self pick (5 total - 1 filled), got ${finalRemainingCap1}`);

  console.log("\nAll merged-manager-slot assertions passed.");

  await prisma.player.update({ where: { id: virat.id }, data: { loginId: viratOriginalLoginId } });
  console.log("Reverted Virat Kohli's loginId back to its original value.");
}

main()
  .catch(async (e) => {
    console.error(e);
    // Best-effort revert even on failure, so a broken assertion doesn't leak
    // shared-fixture mutations into other verification scripts.
    try {
      const virat = await prisma.player.findFirst({ where: { name: "Virat Kohli" } });
      if (virat?.loginId) {
        await prisma.player.update({ where: { id: virat.id }, data: { loginId: null } });
      }
    } catch {
      // ignore
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
