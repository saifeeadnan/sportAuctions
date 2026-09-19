import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import {
  createFixtureLeague,
  createFixtureAdmin,
  createFixtureRoster,
  createFixtureTournament,
  createFixtureTeam,
  createAuctionReadyFixture,
} from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { updateLeagueSettings } from "@/lib/services/league.service";
import { renameTeam } from "@/lib/services/tournament.service";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { concludeAuction } from "@/lib/services/bidding.service";
import { expectAuditLog } from "../helpers/auditLog";

beforeEach(resetDb);

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

async function buildTwoTeamFixture() {
  const league = await createFixtureLeague();
  const admin = await createFixtureAdmin();
  const { roster } = await createFixtureRoster(league.id, admin.id, ["Player A"]);
  const tournament = await createFixtureTournament({
    leagueId: league.id,
    rosterId: roster.id,
    createdById: admin.id,
    numTeams: 2,
    squadSize: 5,
  });
  const teamA = await createFixtureTeam(tournament.id, "Team A");
  const teamB = await createFixtureTeam(tournament.id, "Team B");
  return { league, admin, tournament, teamA, teamB };
}

describe("renameTeam", () => {
  it("rejects a blank name", async () => {
    const { teamA, admin } = await buildTwoTeamFixture();
    await expect(renameTeam(teamA.id, "   ", admin.id)).rejects.toThrow(/name is required/i);
  });

  it("rejects renaming to a name already used by another team in the same tournament", async () => {
    const { teamA, admin } = await buildTwoTeamFixture();
    await expect(renameTeam(teamA.id, "Team B", admin.id)).rejects.toThrow(/already exists/i);
  });

  it("allows renaming to its own current name (no-op)", async () => {
    const { teamA, admin } = await buildTwoTeamFixture();
    const updated = await renameTeam(teamA.id, "Team A", admin.id);
    expect(updated.name).toBe("Team A");
  });

  it("succeeds and audits TEAM_RENAMED when the team hasn't been in an auction", async () => {
    const { teamA, admin } = await buildTwoTeamFixture();
    const updated = await renameTeam(teamA.id, "Renamed Team", admin.id);
    expect(updated.name).toBe("Renamed Team");

    const log = await expectAuditLog({
      entityType: "Team",
      entityId: teamA.id,
      action: "TEAM_RENAMED",
      actorUserId: admin.id,
    });
    expect(log.before).toMatchObject({ name: "Team A" });
    expect(log.after).toMatchObject({ name: "Renamed Team" });
  });

  it("rejects renaming once the league is read-only", async () => {
    const { league, teamA, admin } = await buildTwoTeamFixture();
    await updateLeagueSettings(league.id, { endDate: PAST });
    await expect(renameTeam(teamA.id, "New Name", admin.id)).rejects.toThrow(/read-only/i);
  });

  it("allows renaming while the team's auction is still in progress (not yet completed)", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Test Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await openPreAuction(auction.id, fixture.admin.id);
    await lockPreAuction(auction.id, true, fixture.admin.id);
    await startBidding(auction.id, fixture.admin.id);

    const team = await prisma.team.findFirstOrThrow({ where: { tournamentId: fixture.tournament.id } });
    const updated = await renameTeam(team.id, "New Name", fixture.admin.id);
    expect(updated.name).toBe("New Name");
  });

  it("rejects renaming once the team has completed an auction", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Test Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await openPreAuction(auction.id, fixture.admin.id);
    await lockPreAuction(auction.id, true, fixture.admin.id);
    await startBidding(auction.id, fixture.admin.id);
    await concludeAuction(auction.id, fixture.admin.id);

    const team = await prisma.team.findFirstOrThrow({ where: { tournamentId: fixture.tournament.id } });
    await expect(renameTeam(team.id, "New Name", fixture.admin.id)).rejects.toThrow(
      /completed an auction/i
    );

    const unchanged = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(unchanged.name).toBe(team.name);
  });
});
