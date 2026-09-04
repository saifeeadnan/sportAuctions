import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import {
  createAuction,
  openPreAuction,
  lockPreAuction,
  startBidding,
  updateAuctionTeamSettings,
} from "@/lib/services/auction.service";
import { selectNextPlayer, recordSale, concludeAuction } from "@/lib/services/bidding.service";

beforeEach(resetDb);

/** Mirrors tests/integration/liveBidding.test.ts's fixture helper: a live
 * BIDDING-status auction, squadSize 5, one "Regular" category at base 200. */
async function createLiveAuction(playerNames: string[], teamNames: string[]) {
  const fixture = await createAuctionReadyFixture({ playerNames, teamNames, squadSize: 5 });
  const auction = await createAuction({
    tournamentId: fixture.tournament.id,
    name: "Team Settings Test Auction",
    teamBudget: 2000,
    createdById: fixture.admin.id,
    categories: [{ name: "Regular", basePrice: 200 }],
    playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });
  await openPreAuction(auction.id, fixture.admin.id);
  await lockPreAuction(auction.id, true, fixture.admin.id);
  await startBidding(auction.id, fixture.admin.id);
  return { ...fixture, auction };
}

async function sell(
  auctionId: string,
  playerName: string,
  teamEntryId: string,
  price: number,
  actorUserId: string
) {
  const ap = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId, player: { name: playerName }, status: "AVAILABLE" },
  });
  await selectNextPlayer(auctionId, ap.id);
  await recordSale(auctionId, ap.id, teamEntryId, price, actorUserId);
}

async function getEntries(auctionId: string, teams: { id: string }[]) {
  return Promise.all(
    teams.map((t) => prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId, teamId: t.id } }))
  );
}

describe("updateAuctionTeamSettings — budget", () => {
  it("shifts every team's remaining budget by the same delta, preserving spend so far", async () => {
    const { auction, teams, admin } = await createLiveAuction(["Player A", "Player B"], ["Team 1", "Team 2"]);
    const [team1, team2] = await getEntries(auction.id, teams);

    await sell(auction.id, "Player A", team1.id, 300, admin.id);

    const [before1, before2] = await getEntries(auction.id, teams);

    await updateAuctionTeamSettings(auction.id, { newTeamBudget: 2500 }, admin.id);

    const [after1, after2] = await getEntries(auction.id, teams);
    expect(String(after1.budgetRemaining)).toBe(String(Number(before1.budgetRemaining) + 500));
    expect(String(after2.budgetRemaining)).toBe(String(Number(before2.budgetRemaining) + 500));

    const updatedAuction = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(String(updatedAuction.teamBudget)).toBe("2500");
  });
});

describe("updateAuctionTeamSettings — squad size", () => {
  it("sets every team's slot cap to the new absolute number", async () => {
    const { auction, teams, admin } = await createLiveAuction(["Player A"], ["Team 1", "Team 2"]);

    await updateAuctionTeamSettings(auction.id, { newSquadSize: 7 }, admin.id);

    const [entry1, entry2] = await getEntries(auction.id, teams);
    expect(entry1.slotsTotal).toBe(7);
    expect(entry2.slotsTotal).toBe(7);
  });

  it("does not touch the tournament's own squadSize template", async () => {
    const { auction, teams, tournament, admin } = await createLiveAuction(["Player A"], ["Team 1"]);
    await updateAuctionTeamSettings(auction.id, { newSquadSize: 9 }, admin.id);

    const [entry] = await getEntries(auction.id, teams);
    expect(entry.slotsTotal).toBe(9);

    const unchangedTournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(unchangedTournament.squadSize).toBe(5);
  });
});

describe("updateAuctionTeamSettings — unsafe decreases are fully rejected", () => {
  it("rejects a squad-size decrease below an already-filled slot count, naming the team, and mutates nothing", async () => {
    const { auction, teams, admin } = await createLiveAuction(
      ["Player 1", "Player 2", "Player 3", "Player 4"],
      ["Team 1", "Team 2"]
    );
    const [team1] = await getEntries(auction.id, teams);

    // Manager fee already fills 1 slot; 4 more sales fill the rest (squadSize 5).
    for (const name of ["Player 1", "Player 2", "Player 3", "Player 4"]) {
      await sell(auction.id, name, team1.id, 200, admin.id);
    }
    const [before1, before2] = await getEntries(auction.id, teams);
    expect(before1.slotsFilled).toBe(5);

    await expect(updateAuctionTeamSettings(auction.id, { newSquadSize: 4 }, admin.id)).rejects.toThrow(
      /"Team 1".*already has 5 filled slot/
    );

    const [after1, after2] = await getEntries(auction.id, teams);
    expect(after1.slotsTotal).toBe(before1.slotsTotal);
    expect(after2.slotsTotal).toBe(before2.slotsTotal);
  });

  it("rejects a budget decrease that would put any team into deficit, and mutates nothing", async () => {
    const { auction, teams, admin } = await createLiveAuction(["Player A"], ["Team 1", "Team 2"]);
    const [team1] = await getEntries(auction.id, teams);

    // team1 starts at 1950 (2000 - 50 manager fee); 1350 is the most it can
    // legally spend on one player while still reserving 600 (3 remaining
    // slots x 200 base price) for the rest of its squad.
    await sell(auction.id, "Player A", team1.id, 1350, admin.id);
    const [before1, before2] = await getEntries(auction.id, teams);

    await expect(updateAuctionTeamSettings(auction.id, { newTeamBudget: 500 }, admin.id)).rejects.toThrow(
      /"Team 1".*deficit/
    );

    const [after1, after2] = await getEntries(auction.id, teams);
    expect(String(after1.budgetRemaining)).toBe(String(before1.budgetRemaining));
    expect(String(after2.budgetRemaining)).toBe(String(before2.budgetRemaining));

    const unchangedAuction = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(String(unchangedAuction.teamBudget)).toBe("2000");
  });
});

describe("updateAuctionTeamSettings — status guard", () => {
  it("rejects editing an auction that hasn't opened pre-auction yet", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Not Yet Opened",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });

    await expect(updateAuctionTeamSettings(auction.id, { newTeamBudget: 2000 }, fixture.admin.id)).rejects.toThrow(
      /Open pre-auction/
    );
  });

  it("rejects editing an auction that has already concluded", async () => {
    const { auction, admin } = await createLiveAuction(["Player A"], ["Team 1"]);
    await concludeAuction(auction.id, admin.id);

    await expect(updateAuctionTeamSettings(auction.id, { newTeamBudget: 2000 }, admin.id)).rejects.toThrow(
      /concluded/
    );
  });
});

describe("updateAuctionTeamSettings — input validation", () => {
  it("rejects when neither field is provided", async () => {
    const { auction, admin } = await createLiveAuction(["Player A"], ["Team 1"]);
    await expect(updateAuctionTeamSettings(auction.id, {}, admin.id)).rejects.toThrow(
      /new team budget and\/or a new squad size/
    );
  });

  it("rejects a non-positive team budget", async () => {
    const { auction, admin } = await createLiveAuction(["Player A"], ["Team 1"]);
    await expect(updateAuctionTeamSettings(auction.id, { newTeamBudget: 0 }, admin.id)).rejects.toThrow(
      /greater than 0/
    );
  });

  it("rejects a non-integer or non-positive squad size", async () => {
    const { auction, admin } = await createLiveAuction(["Player A"], ["Team 1"]);
    await expect(updateAuctionTeamSettings(auction.id, { newSquadSize: 2.5 }, admin.id)).rejects.toThrow(
      /whole number/
    );
    await expect(updateAuctionTeamSettings(auction.id, { newSquadSize: 0 }, admin.id)).rejects.toThrow(
      /whole number/
    );
  });
});
