import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/resetDb";
import {
  createAuctionReadyFixture,
  createFixtureLeague,
  createFixtureManager,
  createFixtureUserWithMembership,
} from "../helpers/fixtures";

// See tests/integration/authScope.test.ts for why these mocks exist —
// lib/auth/guards.ts (imported by teamRosterGrid.service.ts) pulls in
// next-auth's real "@/auth", which doesn't resolve under Vitest's plain Node
// environment. Nothing here calls the real auth() function.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";
import { loadTeamRosterGrid } from "@/lib/services/teamRosterGrid.service";

beforeEach(resetDb);

type Session = Parameters<typeof loadTeamRosterGrid>[0];

function sessionFor(
  userId: string,
  opts: { isSiteAdmin?: boolean; memberships?: { leagueId: string; role: string }[] } = {}
) {
  return {
    user: {
      id: userId,
      name: "Test",
      isSiteAdmin: opts.isSiteAdmin ?? false,
      memberships: opts.memberships ?? [],
      analyticsSessionId: "test-session",
    },
  } as unknown as Session;
}

/**
 * Three teams named out of order (to prove the columns get sorted), with
 * Alpha holding three players across two categories, Bravo one, Charlie none.
 */
async function buildAuction({ conclude }: { conclude: boolean }) {
  const fixture = await createAuctionReadyFixture({
    playerNames: ["Zed Regular", "Amy Regular", "Bob Icon", "Dan Regular", "Eve Regular"],
    teamNames: ["Charlie", "Alpha", "Bravo"],
    squadSize: 5,
  });
  const auction = await createAuction({
    tournamentId: fixture.tournament.id,
    name: "Roster Grid Auction",
    teamBudget: 3000,
    createdById: fixture.admin.id,
    categories: [
      { name: "Icon", basePrice: 300 },
      { name: "Regular", basePrice: 100 },
    ],
    playerAssignments: fixture.players.map((p) => ({
      playerId: p.id,
      categoryName: p.name === "Bob Icon" ? "Icon" : "Regular",
    })),
  });
  await openPreAuction(auction.id, fixture.admin.id);
  await lockPreAuction(auction.id, true, fixture.admin.id);
  await startBidding(auction.id, fixture.admin.id);

  const teamByName = new Map(fixture.teams.map((t) => [t.name, t]));
  async function assign(playerName: string, teamName: string, price: number) {
    const player = fixture.players.find((p) => p.name === playerName)!;
    const ap = await prisma.auctionPlayer.findUniqueOrThrow({
      where: { auctionId_playerId: { auctionId: auction.id, playerId: player.id } },
    });
    const entry = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teamByName.get(teamName)!.id },
    });
    await adminAssignPlayer(auction.id, ap.id, entry.id, price, fixture.admin.id);
  }
  await assign("Zed Regular", "Alpha", 100);
  await assign("Amy Regular", "Alpha", 100);
  await assign("Bob Icon", "Alpha", 300);
  await assign("Dan Regular", "Bravo", 100);

  if (conclude) await concludeAuction(auction.id, fixture.admin.id);
  return { ...fixture, auction, teamByName };
}

describe("loadTeamRosterGrid", () => {
  it("lays out one column per team by name, each roster ordered by category price then name", async () => {
    const { auction, teamByName, league } = await buildAuction({ conclude: true });
    const alphaManagerId = teamByName.get("Alpha")!.managerId!;

    const grid = await loadTeamRosterGrid(
      sessionFor(alphaManagerId, { memberships: [{ leagueId: league.id, role: "TEAM_MANAGER" }] }),
      auction.id
    );

    expect(grid.auctionName).toBe("Roster Grid Auction");
    expect(grid.teams.map((t) => t.teamName)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(grid.teams[0].members).toEqual([
      { name: "Bob Icon", categoryName: "Icon" },
      { name: "Amy Regular", categoryName: "Regular" },
      { name: "Zed Regular", categoryName: "Regular" },
    ]);
    expect(grid.teams[1].members).toEqual([{ name: "Dan Regular", categoryName: "Regular" }]);
    expect(grid.teams[2].members).toEqual([]);
  });

  it("marks only the requester's own team, and none for a site admin", async () => {
    const { auction, teamByName, admin, league } = await buildAuction({ conclude: true });

    const asManager = await loadTeamRosterGrid(
      sessionFor(teamByName.get("Bravo")!.managerId!, {
        memberships: [{ leagueId: league.id, role: "TEAM_MANAGER" }],
      }),
      auction.id
    );
    expect(asManager.teams.map((t) => [t.teamName, t.isMine])).toEqual([
      ["Alpha", false],
      ["Bravo", true],
      ["Charlie", false],
    ]);

    const asAdmin = await loadTeamRosterGrid(sessionFor(admin.id, { isSiteAdmin: true }), auction.id);
    expect(asAdmin.teams.every((t) => !t.isMine)).toBe(true);
  });

  it("lets any manager with a team in the auction in, even one who finished with no players", async () => {
    const { auction, teamByName, league } = await buildAuction({ conclude: true });
    const charlieManagerId = teamByName.get("Charlie")!.managerId!;

    const grid = await loadTeamRosterGrid(
      sessionFor(charlieManagerId, { memberships: [{ leagueId: league.id, role: "TEAM_MANAGER" }] }),
      auction.id
    );
    expect(grid.teams).toHaveLength(3);
  });

  it("lets a league admin of its league and the site admin in, but nobody else", async () => {
    const { auction, admin, league } = await buildAuction({ conclude: true });
    const otherLeague = await createFixtureLeague();

    const { user: leagueAdmin } = await createFixtureUserWithMembership(league.id, "LEAGUE_ADMIN");
    await expect(
      loadTeamRosterGrid(
        sessionFor(leagueAdmin.id, { memberships: [{ leagueId: league.id, role: "LEAGUE_ADMIN" }] }),
        auction.id
      )
    ).resolves.toBeDefined();
    await expect(
      loadTeamRosterGrid(sessionFor(admin.id, { isSiteAdmin: true }), auction.id)
    ).resolves.toBeDefined();

    const { user: otherLeagueAdmin } = await createFixtureUserWithMembership(otherLeague.id, "LEAGUE_ADMIN");
    await expect(
      loadTeamRosterGrid(
        sessionFor(otherLeagueAdmin.id, { memberships: [{ leagueId: otherLeague.id, role: "LEAGUE_ADMIN" }] }),
        auction.id
      )
    ).rejects.toThrow(/not authorized/i);

    const { user: viewer } = await createFixtureUserWithMembership(league.id, "VIEWER");
    await expect(
      loadTeamRosterGrid(
        sessionFor(viewer.id, { memberships: [{ leagueId: league.id, role: "VIEWER" }] }),
        auction.id
      )
    ).rejects.toThrow(/not authorized/i);
  });

  it("rejects a manager who has no team in this auction, even in the same league", async () => {
    const { auction, league } = await buildAuction({ conclude: true });
    const outsideManager = await createFixtureManager(league.id);

    await expect(
      loadTeamRosterGrid(
        sessionFor(outsideManager.id, { memberships: [{ leagueId: league.id, role: "TEAM_MANAGER" }] }),
        auction.id
      )
    ).rejects.toThrow(/not authorized/i);
  });

  it("refuses until the auction has concluded, but checks access first", async () => {
    const { auction, teamByName, league } = await buildAuction({ conclude: false });
    const manager = sessionFor(teamByName.get("Alpha")!.managerId!, {
      memberships: [{ leagueId: league.id, role: "TEAM_MANAGER" }],
    });
    await expect(loadTeamRosterGrid(manager, auction.id)).rejects.toThrow(/once the auction has concluded/i);

    const outsider = await createFixtureManager(league.id);
    await expect(
      loadTeamRosterGrid(
        sessionFor(outsider.id, { memberships: [{ leagueId: league.id, role: "TEAM_MANAGER" }] }),
        auction.id
      )
    ).rejects.toThrow(/not authorized/i);
  });

  it("rejects an unknown auction", async () => {
    await expect(loadTeamRosterGrid(sessionFor("nobody", { isSiteAdmin: true }), "does-not-exist")).rejects.toThrow(
      /not found/i
    );
  });
});
