import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction } from "@/lib/services/auction.service";
import { submitDraft } from "@/lib/services/preAuctionDraft.service";

beforeEach(resetDb);

describe("manager self-pick merges with the manager fee slot", () => {
  it("waives the manager fee and merges the slot when a manager's own loginId matches a roster player", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Self Match Player", "Other Player 1", "Other Player 2"],
      teamNames: ["Team 1", "Team 2"],
      squadSize: 5,
      selfMatch: [{ teamName: "Team 1", playerName: "Self Match Player" }],
    });

    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Merged Manager Slot Test Auction",
      teamBudget: 2000,
      createdById: fixture.admin.id,
      categories: [
        { name: "Icon", basePrice: 300 },
        { name: "Regular", basePrice: 100 },
      ],
      playerAssignments: fixture.players.map((p) => ({
        playerId: p.id,
        categoryName: p.name === "Self Match Player" ? "Icon" : "Regular",
      })),
    });

    await openPreAuction(auction.id, fixture.admin.id);

    const entry1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: fixture.teams[0].id },
    });
    const entry2 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: fixture.teams[1].id },
    });

    // Team 1 (self-matched manager): no manager fee, slot not pre-filled.
    expect(entry1.slotsFilled).toBe(0);
    expect(String(entry1.budgetRemaining)).toBe("2000");
    expect(entry1.slotsTotal - entry1.slotsFilled).toBe(5);

    // Team 2 (not self-matched): the normal manager fee still applies.
    expect(entry2.slotsFilled).toBe(1);
    expect(String(entry2.budgetRemaining)).toBe("1950");

    const selfPickAp = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, player: { name: "Self Match Player" } },
    });
    await submitDraft(entry1.id, [selfPickAp.id], fixture.teams[0].managerId!);
    await lockPreAuction(auction.id, true, fixture.admin.id);

    const finalEntry1 = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: entry1.id } });
    expect(finalEntry1.slotsFilled).toBe(1);
    // 2000 - 300 (Icon base price for the uniquely-drafted self pick) = 1700
    expect(String(finalEntry1.budgetRemaining)).toBe("1700");
    expect(finalEntry1.slotsTotal - finalEntry1.slotsFilled).toBe(4);
  });
});
