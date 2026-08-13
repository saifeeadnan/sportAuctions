import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import {
  createFixtureLeague,
  createFixtureAdmin,
  createFixtureRoster,
  createFixtureTournament,
  createFixtureManager,
  createFixtureTeam,
} from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { updateLeagueSettings } from "@/lib/services/league.service";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import {
  adminAssignPlayer,
  concludeAuction,
  removePlayerPostAuction,
  addPlayerPostAuction,
  replacePlayerPostAuction,
} from "@/lib/services/bidding.service";

beforeEach(resetDb);

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

/**
 * A concluded auction with two teams: Team 1 has Player A (sold @200), Team 2
 * has Player D (sold @150). Player B is in the auction's pool but never sold
 * (goes UNSOLD at conclusion). Player C is in the tournament's roster but was
 * never added to this auction's pool at all — exercises the "create a fresh
 * AuctionPlayer row" path. squadSize is 3 (not 2) because createFixtureTeam's
 * manager occupies a slot and debits its managerBasePrice (50) at
 * openPreAuction time, same as every other manager-occupies-a-slot fixture in
 * this codebase — so each team is manager(1) + assigned player(1) = 2/3
 * filled, leaving one open slot for the add/replace tests below. Each team's
 * budgetRemaining after setup is 1000 - 50 (manager) - price (assigned player).
 */
async function buildCompletedAuctionFixture() {
  const league = await createFixtureLeague();
  const admin = await createFixtureAdmin();
  const { roster, players } = await createFixtureRoster(league.id, admin.id, [
    "Player A",
    "Player B",
    "Player C",
    "Player D",
  ]);
  const [playerA, playerB, playerC, playerD] = players;
  const tournament = await createFixtureTournament({
    leagueId: league.id,
    rosterId: roster.id,
    createdById: admin.id,
    numTeams: 2,
    squadSize: 3,
  });
  const manager1 = await createFixtureManager(league.id);
  const manager2 = await createFixtureManager(league.id);
  await createFixtureTeam(tournament.id, "Team 1", manager1.id);
  await createFixtureTeam(tournament.id, "Team 2", manager2.id);

  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "Auction",
    teamBudget: 1000,
    createdById: admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: [playerA, playerB, playerD].map((p) => ({
      playerId: p.id,
      categoryName: "Regular",
    })),
  });
  const category = (await prisma.auctionCategory.findFirstOrThrow({ where: { auctionId: auction.id } }));

  await openPreAuction(auction.id);
  await lockPreAuction(auction.id, true);
  await startBidding(auction.id);

  const entries = await prisma.teamAuctionEntry.findMany({
    where: { auctionId: auction.id },
    include: { team: true },
    orderBy: { team: { name: "asc" } },
  });
  const [team1Entry, team2Entry] = entries;

  const auctionPlayerByName = async (name: string) =>
    prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, player: { name } },
    });

  const aAuctionPlayer = await auctionPlayerByName("Player A");
  const dAuctionPlayer = await auctionPlayerByName("Player D");

  await adminAssignPlayer(auction.id, aAuctionPlayer.id, team1Entry.id, 200);
  await adminAssignPlayer(auction.id, dAuctionPlayer.id, team2Entry.id, 150);

  return {
    league,
    admin,
    tournament,
    auction,
    category,
    playerA,
    playerB,
    playerC,
    playerD,
    team1Entry,
    team2Entry,
    aAuctionPlayer,
  };
}

async function concludeFixture(fixture: Awaited<ReturnType<typeof buildCompletedAuctionFixture>>) {
  await concludeAuction(fixture.auction.id);
}

describe("replacePlayerPostAuction", () => {
  it("swaps an outgoing sold player for an already-UNSOLD pool player, shifting budget by the price delta", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);

    await replacePlayerPostAuction(fx.auction.id, fx.aAuctionPlayer.id, fx.playerB.id, fx.category.id, 250);

    const outgoing = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: fx.aAuctionPlayer.id } });
    expect(outgoing.status).toBe("UNSOLD");
    expect(outgoing.soldVia).toBeNull();
    expect(outgoing.soldToEntryId).toBeNull();
    expect(outgoing.soldPrice).toBeNull();

    const incoming = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: fx.auction.id, playerId: fx.playerB.id },
    });
    expect(incoming.status).toBe("SOLD");
    expect(incoming.soldVia).toBe("ADMIN_REPLACED");
    expect(incoming.soldToEntryId).toBe(fx.team1Entry.id);
    expect(String(incoming.soldPrice)).toBe("250");

    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(entry.budgetRemaining)).toBe("700"); // (1000 - 50 manager - 200 A) + 200 - 250
    expect(entry.slotsFilled).toBe(2);
  });

  it("creates a fresh AuctionPlayer row when the replacement was never added to the auction's pool", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);
    const dAuctionPlayer = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: fx.auction.id, playerId: fx.playerD.id },
    });

    await replacePlayerPostAuction(fx.auction.id, dAuctionPlayer.id, fx.playerC.id, fx.category.id, 120);

    const incoming = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: fx.auction.id, playerId: fx.playerC.id },
    });
    expect(incoming.status).toBe("SOLD");
    expect(incoming.soldVia).toBe("ADMIN_REPLACED");
    expect(incoming.soldToEntryId).toBe(fx.team2Entry.id);
    expect(String(incoming.soldPrice)).toBe("120");

    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team2Entry.id } });
    expect(String(entry.budgetRemaining)).toBe("830"); // (1000 - 50 manager - 150 D) + 150 - 120
    expect(entry.slotsFilled).toBe(2);
  });

  it("rejects replacing a player with themselves", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);
    await expect(
      replacePlayerPostAuction(fx.auction.id, fx.aAuctionPlayer.id, fx.playerA.id, fx.category.id, 100)
    ).rejects.toThrow(/different from the outgoing player/);
  });

  it("rejects a replacement that's already sold to another team", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);
    await expect(
      replacePlayerPostAuction(fx.auction.id, fx.aAuctionPlayer.id, fx.playerD.id, fx.category.id, 100)
    ).rejects.toThrow(/already on "Team 2"/);
  });

  it("rejects once the auction hasn't concluded yet", async () => {
    const fx = await buildCompletedAuctionFixture();
    await expect(
      replacePlayerPostAuction(fx.auction.id, fx.aAuctionPlayer.id, fx.playerB.id, fx.category.id, 100)
    ).rejects.toThrow(/only available after the auction has concluded/);
  });

  it("rejects once the league is read-only", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);
    await updateLeagueSettings(fx.league.id, { endDate: PAST });
    await expect(
      replacePlayerPostAuction(fx.auction.id, fx.aAuctionPlayer.id, fx.playerB.id, fx.category.id, 100)
    ).rejects.toThrow(/read-only/);
  });
});

describe("removePlayerPostAuction", () => {
  it("refunds the price and frees the slot", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);

    await removePlayerPostAuction(fx.auction.id, fx.aAuctionPlayer.id);

    const outgoing = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: fx.aAuctionPlayer.id } });
    expect(outgoing.status).toBe("UNSOLD");
    expect(outgoing.soldToEntryId).toBeNull();

    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(entry.budgetRemaining)).toBe("950"); // (1000 - 50 manager - 200 A) + 200
    expect(entry.slotsFilled).toBe(1);
  });
});

describe("addPlayerPostAuction", () => {
  it("fills an open slot using an already-UNSOLD pool player", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);

    await addPlayerPostAuction(fx.auction.id, fx.team1Entry.id, fx.playerB.id, fx.category.id, 90);

    const incoming = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: fx.auction.id, playerId: fx.playerB.id },
    });
    expect(incoming.status).toBe("SOLD");
    expect(incoming.soldVia).toBe("ADMIN_REPLACED");
    expect(incoming.soldToEntryId).toBe(fx.team1Entry.id);

    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(entry.budgetRemaining)).toBe("660"); // (1000 - 50 manager - 200 A) - 90
    expect(entry.slotsFilled).toBe(3);
  });

  it("creates a fresh AuctionPlayer row for a roster player never added to the pool", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);

    await addPlayerPostAuction(fx.auction.id, fx.team1Entry.id, fx.playerC.id, fx.category.id, 80);

    const incoming = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: fx.auction.id, playerId: fx.playerC.id },
    });
    expect(incoming.status).toBe("SOLD");
    expect(incoming.soldToEntryId).toBe(fx.team1Entry.id);

    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(entry.budgetRemaining)).toBe("670"); // (1000 - 50 manager - 200 A) - 80
    expect(entry.slotsFilled).toBe(3);
  });

  it("rejects once the team's squad is already full", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);
    await addPlayerPostAuction(fx.auction.id, fx.team1Entry.id, fx.playerB.id, fx.category.id, 90);

    await expect(
      addPlayerPostAuction(fx.auction.id, fx.team1Entry.id, fx.playerC.id, fx.category.id, 50)
    ).rejects.toThrow(/already filled its squad/);
  });

  it("rejects when the price exceeds the team's remaining budget", async () => {
    const fx = await buildCompletedAuctionFixture();
    await concludeFixture(fx);
    await expect(
      addPlayerPostAuction(fx.auction.id, fx.team1Entry.id, fx.playerB.id, fx.category.id, 10_000)
    ).rejects.toThrow(/does not have enough budget/);
  });
});
