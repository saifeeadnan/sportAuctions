import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction } from "@/lib/services/auction.service";
import { submitDraft } from "@/lib/services/preAuctionDraft.service";

beforeEach(resetDb);

describe("pre-auction draft -> overlap resolution", () => {
  it("auto-allocates uniquely-drafted players, sends contested picks to the live pool, and leaves undrafted players AVAILABLE", async () => {
    // 5 Icon players (indices 0-4), 7 Regular players (indices 5-11) — same
    // split the original verify-phase3.ts script used.
    const playerNames = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const fixture = await createAuctionReadyFixture({
      playerNames,
      teamNames: ["Team 1", "Team 2", "Team 3"],
      squadSize: 5,
    });
    const players = fixture.players; // already sorted by name asc: P0, P1, P10, P11, P2, ...

    const byName = (name: string) => players.find((p) => p.name === name)!;
    const iconPlayers = playerNames.slice(0, 5).map(byName);
    const regularPlayers = playerNames.slice(5).map(byName);

    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Phase3 Test Auction",
      teamBudget: 2000,
      createdById: fixture.admin.id,
      categories: [
        { name: "Icon", basePrice: 500 },
        { name: "Regular", basePrice: 100 },
      ],
      playerAssignments: [
        ...iconPlayers.map((p) => ({ playerId: p.id, categoryName: "Icon" })),
        ...regularPlayers.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
      ],
    });

    await openPreAuction(auction.id, fixture.admin.id);

    const [e1, e2, e3] = await Promise.all(
      fixture.teams.map((t) =>
        prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id, teamId: t.id } })
      )
    );

    const apByPlayerName = new Map(
      (
        await prisma.auctionPlayer.findMany({ where: { auctionId: auction.id }, include: { player: true } })
      ).map((ap) => [ap.player.name, ap])
    );

    const uniqueA = "P0"; // Icon
    const uniqueB = "P1"; // Icon
    const uniqueC = "P6"; // Regular
    const contested = "P2"; // Icon, drafted by both Team 1 and Team 2
    const untouched = "P10"; // never drafted

    await submitDraft(
      e1.id,
      [apByPlayerName.get(uniqueA)!.id, apByPlayerName.get(contested)!.id],
      fixture.teams[0].managerId!
    );
    await submitDraft(
      e2.id,
      [apByPlayerName.get(uniqueB)!.id, apByPlayerName.get(contested)!.id],
      fixture.teams[1].managerId!
    );
    await submitDraft(e3.id, [apByPlayerName.get(uniqueC)!.id], fixture.teams[2].managerId!);

    await lockPreAuction(auction.id, false, fixture.admin.id);

    const finalPlayers = await prisma.auctionPlayer.findMany({
      where: { auctionId: auction.id },
      include: { player: true, soldToEntry: { include: { team: true } } },
    });
    const finalByName = (name: string) => finalPlayers.find((p) => p.player.name === name)!;

    const apA = finalByName(uniqueA);
    expect(apA.status).toBe("SOLD");
    expect(apA.soldVia).toBe("PRE_AUCTION_DRAFT");
    expect(apA.soldToEntry?.team.name).toBe("Team 1");
    expect(String(apA.soldPrice)).toBe("500");

    expect(finalByName(uniqueB).soldToEntry?.team.name).toBe("Team 2");

    const apC = finalByName(uniqueC);
    expect(apC.soldToEntry?.team.name).toBe("Team 3");
    expect(String(apC.soldPrice)).toBe("100");

    expect(finalByName(contested).status).toBe("IN_PRE_AUCTION_POOL");
    expect(finalByName(untouched).status).toBe("AVAILABLE");

    const finalEntries = await prisma.teamAuctionEntry.findMany({
      where: { auctionId: auction.id },
      include: { team: true },
    });
    const finalE1 = finalEntries.find((e) => e.team.name === "Team 1")!;
    const finalE2 = finalEntries.find((e) => e.team.name === "Team 2")!;
    const finalE3 = finalEntries.find((e) => e.team.name === "Team 3")!;

    // 2000 - 50 (manager fee) - 500 (Icon base price for the unique pick) = 1450
    expect(String(finalE1.budgetRemaining)).toBe("1450");
    expect(String(finalE2.budgetRemaining)).toBe("1450");
    // 2000 - 50 (manager fee) - 100 (Regular base price) = 1850
    expect(String(finalE3.budgetRemaining)).toBe("1850");

    expect(finalE1.slotsFilled).toBe(2); // manager + the unique pick
    expect(finalE3.slotsFilled).toBe(2);

    expect(finalEntries.every((e) => e.status === "ALLOCATED_PRE_AUCTION")).toBe(true);
  });
});
