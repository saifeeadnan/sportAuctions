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
import {
  isLeagueReadOnly,
  updateLeagueSettings,
  assertAuctionLeagueNotReadOnly,
} from "@/lib/services/league.service";
import { createTournament, createTeam, deleteTeam } from "@/lib/services/tournament.service";
import {
  createAuction,
  addPlayerToAuction,
  updateAuctionPlayerCategory,
  updateCategoryBidIncrement,
  openPreAuction,
  lockPreAuction,
  startBidding,
  resetAuctionToPreBidding,
  updateAuctionTeamSettings,
} from "@/lib/services/auction.service";
import {
  selectNextPlayer,
  placeBid,
  markUnsold,
  removePlayerFromTeam,
  concludeAuction,
  recordSale,
  adminAssignPlayer,
} from "@/lib/services/bidding.service";
import {
  addTournamentSponsor,
  addExistingTournamentSponsor,
} from "@/lib/services/tournamentSponsor.service";
import { createRosterFromUpload, createPlayer } from "@/lib/services/roster.service";
import { deleteUser } from "@/lib/services/user.service";

beforeEach(resetDb);

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

// registerUserAction's read-only check is exercised at the action layer,
// which requires mocking next-auth's session the way authScope.test.ts does
// for a different action; the actual logic it calls (assertLeagueNotReadOnly)
// is a pure function already covered directly below and via every other
// creation path in this file, so it isn't re-tested through the action here.

describe("isLeagueReadOnly", () => {
  it("is false with no end date, false with a future end date, true with a past one", () => {
    expect(isLeagueReadOnly({ endDate: null })).toBe(false);
    expect(isLeagueReadOnly({ endDate: FUTURE })).toBe(false);
    expect(isLeagueReadOnly({ endDate: PAST })).toBe(true);
  });
});

describe("max tournaments per league", () => {
  it("rejects once the cap is reached, allows below it", async () => {
    const league = await createFixtureLeague({ maxTournaments: 1 });
    const admin = await createFixtureAdmin();

    await createTournament({
      name: "T1",
      leagueId: league.id,
      numTeams: 2,
      squadSize: 5,
      startDate: new Date(),
      endDate: FUTURE,
      createdById: admin.id,
    });

    await expect(
      createTournament({
        name: "T2",
        leagueId: league.id,
        numTeams: 2,
        squadSize: 5,
        startDate: new Date(),
        endDate: FUTURE,
        createdById: admin.id,
      })
    ).rejects.toThrow(/maximum of 1 tournament/);
  });
});

describe("max teams per tournament", () => {
  it("rejects a tournament created with numTeams above the league cap", async () => {
    const league = await createFixtureLeague({ maxTeamsPerTournament: 3 });
    const admin = await createFixtureAdmin();

    await expect(
      createTournament({
        name: "Too many teams",
        leagueId: league.id,
        numTeams: 4,
        squadSize: 5,
        startDate: new Date(),
        endDate: FUTURE,
        createdById: admin.id,
      })
    ).rejects.toThrow(/at most 3 team/);

    const ok = await createTournament({
      name: "Within cap",
      leagueId: league.id,
      numTeams: 3,
      squadSize: 5,
      startDate: new Date(),
      endDate: FUTURE,
      createdById: admin.id,
    });
    expect(ok.numTeams).toBe(3);
  });
});

describe("max sponsors per tournament — proven per-tournament, not league-wide", () => {
  it("caps one tournament's sponsors without affecting a different tournament in the same league", async () => {
    const league = await createFixtureLeague({ maxSponsorsPerTournament: 1 });
    const admin = await createFixtureAdmin();
    const { roster } = await createFixtureRoster(league.id, admin.id, ["Player A"]);
    const t1 = await createFixtureTournament({
      leagueId: league.id,
      rosterId: roster.id,
      createdById: admin.id,
      numTeams: 2,
      squadSize: 5,
    });
    const t2 = await createFixtureTournament({
      leagueId: league.id,
      rosterId: roster.id,
      createdById: admin.id,
      numTeams: 2,
      squadSize: 5,
    });

    const file = { type: "image/png", data: Buffer.from([1, 2, 3]) };
    await addTournamentSponsor({ tournamentId: t1.id, name: "Sponsor A", file });

    await expect(
      addTournamentSponsor({ tournamentId: t1.id, name: "Sponsor B", file })
    ).rejects.toThrow(/maximum of 1 sponsor/);

    // A second tournament in the same league is unaffected.
    const t2Sponsor = await addTournamentSponsor({ tournamentId: t2.id, name: "Sponsor C", file });
    expect(t2Sponsor.name).toBe("Sponsor C");
  });
});

describe("read-only league blocks every creation path", () => {
  async function buildReadOnlyFixture() {
    const league = await createFixtureLeague({ endDate: PAST });
    const admin = await createFixtureAdmin();
    const { roster, players } = await createFixtureRoster(league.id, admin.id, ["Player A"]);
    const tournament = await createFixtureTournament({
      leagueId: league.id,
      rosterId: roster.id,
      createdById: admin.id,
      numTeams: 2,
      squadSize: 5,
    });
    return { league, admin, roster, players, tournament };
  }

  it("blocks createTournament", async () => {
    const { league, admin } = await buildReadOnlyFixture();
    await expect(
      createTournament({
        name: "New tournament",
        leagueId: league.id,
        numTeams: 2,
        squadSize: 5,
        startDate: new Date(),
        endDate: FUTURE,
        createdById: admin.id,
      })
    ).rejects.toThrow(/read-only/);
  });

  it("blocks createTeam", async () => {
    const { tournament, admin } = await buildReadOnlyFixture();
    await expect(
      createTeam({ tournamentId: tournament.id, name: "New Team", managerOccupiesSlot: true }, admin.id)
    ).rejects.toThrow(/read-only/);
  });

  it("blocks addTournamentSponsor and addExistingTournamentSponsor", async () => {
    const { tournament } = await buildReadOnlyFixture();
    const file = { type: "image/png", data: Buffer.from([1, 2, 3]) };
    await expect(
      addTournamentSponsor({ tournamentId: tournament.id, name: "Sponsor", file })
    ).rejects.toThrow(/read-only/);
    await expect(
      addExistingTournamentSponsor(tournament.id, "does-not-matter")
    ).rejects.toThrow(/read-only/);
  });

  it("blocks createAuction", async () => {
    const { tournament, players } = await buildReadOnlyFixture();
    await expect(
      createAuction({
        tournamentId: tournament.id,
        name: "New auction",
        teamBudget: 1000,
        createdById: (await createFixtureAdmin()).id,
        categories: [{ name: "Regular", basePrice: 100 }],
        playerAssignments: players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
      })
    ).rejects.toThrow(/read-only/);
  });

  it("blocks createRosterFromUpload", async () => {
    const { league, admin } = await buildReadOnlyFixture();
    await expect(
      createRosterFromUpload("New Roster", [{ name: "Some Player" }], admin.id, league.id)
    ).rejects.toThrow(/read-only/);
  });

  it("blocks createPlayer", async () => {
    const { roster } = await buildReadOnlyFixture();
    await expect(createPlayer(roster.id, { name: "New Player" })).rejects.toThrow(/read-only/);
  });

  it("allows the same creation paths once the league has no end date / a future one", async () => {
    const league = await createFixtureLeague({ endDate: FUTURE });
    const admin = await createFixtureAdmin();
    const tournament = await createTournament({
      name: "Fine",
      leagueId: league.id,
      numTeams: 2,
      squadSize: 5,
      startDate: new Date(),
      endDate: FUTURE,
      createdById: admin.id,
    });
    expect(tournament.leagueId).toBe(league.id);
  });
});

describe("updateLeagueSettings", () => {
  it("rejects an end date before the start date", async () => {
    const league = await createFixtureLeague();
    await expect(
      updateLeagueSettings(league.id, { startDate: FUTURE, endDate: PAST })
    ).rejects.toThrow(/before start date/);
  });

  it("rejects a non-positive or non-integer cap", async () => {
    const league = await createFixtureLeague();
    await expect(updateLeagueSettings(league.id, { maxTournaments: 0 })).rejects.toThrow(
      /positive whole number/
    );
    await expect(updateLeagueSettings(league.id, { maxTeamsPerTournament: 2.5 })).rejects.toThrow(
      /positive whole number/
    );
  });

  it("lowering a cap below an existing count leaves existing rows untouched and blocks only the next creation", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const t1 = await createTournament({
      name: "T1",
      leagueId: league.id,
      numTeams: 2,
      squadSize: 5,
      startDate: new Date(),
      endDate: FUTURE,
      createdById: admin.id,
    });
    const t2 = await createTournament({
      name: "T2",
      leagueId: league.id,
      numTeams: 2,
      squadSize: 5,
      startDate: new Date(),
      endDate: FUTURE,
      createdById: admin.id,
    });

    await updateLeagueSettings(league.id, { maxTournaments: 1 });

    const stillExist = await prisma.tournament.findMany({ where: { id: { in: [t1.id, t2.id] } } });
    expect(stillExist).toHaveLength(2);

    await expect(
      createTournament({
        name: "T3",
        leagueId: league.id,
        numTeams: 2,
        squadSize: 5,
        startDate: new Date(),
        endDate: FUTURE,
        createdById: admin.id,
      })
    ).rejects.toThrow(/maximum of 1 tournament/);
  });
});

describe("deleteTeam blocked when league is read-only", () => {
  it("blocks deleting a team once the league becomes read-only", async () => {
    const league = await createFixtureLeague({ endDate: FUTURE });
    const admin = await createFixtureAdmin();
    const { roster } = await createFixtureRoster(league.id, admin.id, ["Player A"]);
    const tournament = await createFixtureTournament({
      leagueId: league.id,
      rosterId: roster.id,
      createdById: admin.id,
      numTeams: 2,
      squadSize: 5,
    });
    const team = await createTeam({
      tournamentId: tournament.id,
      name: "Team A",
      managerOccupiesSlot: true,
    }, admin.id);

    await updateLeagueSettings(league.id, { endDate: PAST });

    await expect(deleteTeam(team.id, admin.id)).rejects.toThrow(/read-only/);
  });
});

// deleteUser is now identity-level, used only for site-Admin accounts (which
// aren't scoped to any league) — the read-only-league gate that used to live
// here now belongs to deleteMembership instead, covered in
// tests/integration/multiLeagueUsers.test.ts.
describe("deleteUser", () => {
  it("deletes an identity with no linked resources", async () => {
    const admin = await createFixtureAdmin();
    const other = await createFixtureAdmin();

    await deleteUser(other.id, admin.id);

    const found = await prisma.user.findUnique({ where: { id: other.id } });
    expect(found).toBeNull();
  });
});

describe("read-only league freezes the Auctioneer console and auction-settings edits", () => {
  /** League starts with a future end date so every setup step succeeds, then
   * gets flipped read-only via updateLeagueSettings — mirroring a real league
   * that had live data before its end date passed. */
  async function buildBiddingReadyFixture() {
    const league = await createFixtureLeague({ endDate: FUTURE });
    const admin = await createFixtureAdmin();
    const { roster, players } = await createFixtureRoster(league.id, admin.id, [
      "Player A",
      "Player B",
    ]);
    const tournament = await createFixtureTournament({
      leagueId: league.id,
      rosterId: roster.id,
      createdById: admin.id,
      numTeams: 2,
      squadSize: 2,
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
      playerAssignments: players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });

    await openPreAuction(auction.id, admin.id);
    await lockPreAuction(auction.id, true, admin.id);
    await startBidding(auction.id, admin.id);

    const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id } });
    const auctionPlayers = await prisma.auctionPlayer.findMany({ where: { auctionId: auction.id } });
    const categories = await prisma.auctionCategory.findMany({ where: { auctionId: auction.id } });

    return { league, admin, tournament, players, auction, entries, auctionPlayers, categories };
  }

  it("assertAuctionLeagueNotReadOnly passes while the league is active and throws once it isn't", async () => {
    const { league, auction } = await buildBiddingReadyFixture();
    await expect(assertAuctionLeagueNotReadOnly(auction.id)).resolves.toBeUndefined();

    await updateLeagueSettings(league.id, { endDate: PAST });
    await expect(assertAuctionLeagueNotReadOnly(auction.id)).rejects.toThrow(/read-only/);
  });

  it("blocks every Auctioneer-console bidding action", async () => {
    const { league, admin, auction, entries, auctionPlayers } = await buildBiddingReadyFixture();
    await updateLeagueSettings(league.id, { endDate: PAST });

    await expect(selectNextPlayer(auction.id, auctionPlayers[0].id)).rejects.toThrow(/read-only/);
    await expect(placeBid(auction.id, auctionPlayers[0].id, entries[0].id, 100)).rejects.toThrow(
      /read-only/
    );
    await expect(markUnsold(auction.id, auctionPlayers[0].id, admin.id)).rejects.toThrow(/read-only/);
    await expect(removePlayerFromTeam(auction.id, auctionPlayers[0].id, admin.id)).rejects.toThrow(
      /read-only/
    );
    await expect(concludeAuction(auction.id, admin.id)).rejects.toThrow(/read-only/);
  });

  it("blocks recordSale once a player is on the clock", async () => {
    const { league, admin, auction, entries, auctionPlayers } = await buildBiddingReadyFixture();
    const onClock = await selectNextPlayer(auction.id, auctionPlayers[0].id);

    await updateLeagueSettings(league.id, { endDate: PAST });

    await expect(
      recordSale(auction.id, onClock.id, entries[0].id, 100, admin.id)
    ).rejects.toThrow(/read-only/);
  });

  it("blocks adminAssignPlayer", async () => {
    const { league, admin, auction, entries, auctionPlayers } = await buildBiddingReadyFixture();
    await updateLeagueSettings(league.id, { endDate: PAST });

    await expect(
      adminAssignPlayer(auction.id, auctionPlayers[0].id, entries[0].id, 100, admin.id)
    ).rejects.toThrow(/read-only/);
  });

  it("blocks every auction-settings edit", async () => {
    const { league, admin, auction, players, categories } = await buildBiddingReadyFixture();
    await updateLeagueSettings(league.id, { endDate: PAST });

    await expect(
      addPlayerToAuction(auction.id, players[0].id, categories[0].id, admin.id)
    ).rejects.toThrow(/read-only/);
    await expect(
      updateAuctionPlayerCategory(auction.id, "placeholder", categories[0].id, admin.id)
    ).rejects.toThrow(/read-only/);
    await expect(updateCategoryBidIncrement(categories[0].id, 10, admin.id)).rejects.toThrow(/read-only/);
    await expect(resetAuctionToPreBidding(auction.id, admin.id)).rejects.toThrow(/read-only/);
    await expect(
      updateAuctionTeamSettings(auction.id, { newTeamBudget: 2000 }, admin.id)
    ).rejects.toThrow(/read-only/);
  });
});
