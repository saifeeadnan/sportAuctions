import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureLeague, createFixtureAdmin, createFixtureRoster } from "../helpers/fixtures";
import { createTournament, attachRosterToTournament } from "@/lib/services/tournament.service";

beforeEach(resetDb);

function tournamentDates() {
  return { startDate: new Date(), endDate: new Date(Date.now() + 24 * 60 * 60 * 1000) };
}

describe("createTournament without a roster", () => {
  it("creates successfully with an explicit leagueId when no roster is given", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();

    const tournament = await createTournament({
      name: "Roster-less Tournament",
      leagueId: league.id,
      numTeams: 4,
      squadSize: 11,
      createdById: admin.id,
      ...tournamentDates(),
    });

    expect(tournament.rosterId).toBeNull();
    expect(tournament.leagueId).toBe(league.id);
  });

  it("requires either a roster or an explicit league", async () => {
    const admin = await createFixtureAdmin();

    await expect(
      createTournament({
        name: "No League No Roster",
        numTeams: 4,
        squadSize: 11,
        createdById: admin.id,
        ...tournamentDates(),
      })
    ).rejects.toThrow(/league or a roster/);
  });

  it("still derives leagueId from the roster when one is given, ignoring any explicit leagueId", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { roster } = await createFixtureRoster(league.id, admin.id, ["Player A"]);

    const tournament = await createTournament({
      name: "Rostered Tournament",
      rosterId: roster.id,
      numTeams: 2,
      squadSize: 5,
      createdById: admin.id,
      ...tournamentDates(),
    });

    expect(tournament.rosterId).toBe(roster.id);
    expect(tournament.leagueId).toBe(league.id);
  });
});

describe("attachRosterToTournament", () => {
  it("attaches a roster from the tournament's own league", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { roster } = await createFixtureRoster(league.id, admin.id, ["Player A"]);
    const tournament = await createTournament({
      name: "Attach Test Tournament",
      leagueId: league.id,
      numTeams: 2,
      squadSize: 5,
      createdById: admin.id,
      ...tournamentDates(),
    });

    const updated = await attachRosterToTournament(tournament.id, roster.id);
    expect(updated.rosterId).toBe(roster.id);
  });

  it("is locked once a roster is already attached — no swap allowed", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { roster: firstRoster } = await createFixtureRoster(league.id, admin.id, ["Player A"]);
    const { roster: secondRoster } = await createFixtureRoster(league.id, admin.id, ["Player B"]);
    const tournament = await createTournament({
      name: "Locked Attach Test Tournament",
      rosterId: firstRoster.id,
      numTeams: 2,
      squadSize: 5,
      createdById: admin.id,
      ...tournamentDates(),
    });

    await expect(attachRosterToTournament(tournament.id, secondRoster.id)).rejects.toThrow(
      /already has a roster attached/
    );
  });

  it("rejects a roster from a different league than the tournament's own", async () => {
    const league = await createFixtureLeague();
    const otherLeague = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { roster: otherLeagueRoster } = await createFixtureRoster(otherLeague.id, admin.id, ["Player A"]);
    const tournament = await createTournament({
      name: "Cross League Attach Test Tournament",
      leagueId: league.id,
      numTeams: 2,
      squadSize: 5,
      createdById: admin.id,
      ...tournamentDates(),
    });

    await expect(attachRosterToTournament(tournament.id, otherLeagueRoster.id)).rejects.toThrow(
      /same league/
    );
  });
});
