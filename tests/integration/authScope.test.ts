import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";

// lib/auth/guards.ts (imported transitively via lib/auth/scope.ts) imports
// the real "@/auth", which pulls in next-auth's own next/server import —
// that import chain doesn't resolve under Vitest's plain Node environment
// (it expects Next's own bundler). Nothing under test here ever calls the
// real auth() function, so it's stubbed out rather than actually loaded.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
// guards.ts's requireSession() also calls next/headers() as its bearer-token
// fallback path — not exercised by anything in this suite either, but the
// import itself must resolve under Vitest the same way @/auth's mock above
// exists to satisfy import resolution, not behavior under test.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { loadScopedAuction } = await import("@/lib/auth/scope");
const { AuthError, assertCanAccessTeamEntry } = await import("@/lib/auth/guards");
const { createAuction } = await import("@/lib/services/auction.service");

beforeEach(resetDb);

/**
 * Regression coverage for the auctioneer-console access bug found this
 * session: a LEAGUE_ADMIN must reach an auction in their own league and be
 * rejected for one in a different league. The bug itself was a role-gate
 * excluding LEAGUE_ADMIN before this scoping check ever ran, but the check
 * is the actual security boundary and deserves its own direct coverage.
 */
describe("loadScopedAuction league scoping", () => {
  it("allows a caller scoped to the auction's own league", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Scope Test Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });

    await expect(loadScopedAuction(auction.id, [fixture.league.id])).resolves.toMatchObject({
      id: auction.id,
    });
  });

  it("rejects a caller scoped to a different league", async () => {
    const fixtureA = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const fixtureB = await createAuctionReadyFixture({
      playerNames: ["Player B"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const auctionInLeagueA = await createAuction({
      tournamentId: fixtureA.tournament.id,
      name: "League A Auction",
      teamBudget: 1000,
      createdById: fixtureA.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixtureA.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });

    await expect(loadScopedAuction(auctionInLeagueA.id, [fixtureB.league.id])).rejects.toThrow(AuthError);
  });

  it("allows an unrestricted (site ADMIN) caller regardless of league", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Unrestricted Scope Test Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });

    await expect(loadScopedAuction(auction.id, null)).resolves.toMatchObject({ id: auction.id });
  });
});

/**
 * Pure policy check for one team's auction entry (roster-card PNG + public
 * share link). Replaced an inline branch that had two real defects — a user
 * with ANY manager membership was forced down the "must manage this team"
 * path even when they were also a league admin, and the admin path scoped
 * on every league of any role, so a league admin of A who was merely a
 * viewer in B could reach B's teams. These cases pin the fixed policy.
 */
describe("assertCanAccessTeamEntry", () => {
  type Session = Parameters<typeof assertCanAccessTeamEntry>[0];
  const entry = (managerId: string | null, leagueId: string) => ({
    team: { managerId },
    auction: { tournament: { leagueId } },
  });
  const session = (
    id: string,
    memberships: { leagueId: string; role: string }[],
    isSiteAdmin = false
  ) => ({ user: { id, name: "Someone", isSiteAdmin, memberships } }) as unknown as Session;

  it("allows the team's own manager", () => {
    const s = session("mgr", [{ leagueId: "A", role: "TEAM_MANAGER" }]);
    expect(() => assertCanAccessTeamEntry(s, entry("mgr", "A"))).not.toThrow();
  });

  it("rejects a manager of a different team", () => {
    const s = session("mgr", [{ leagueId: "A", role: "TEAM_MANAGER" }]);
    expect(() => assertCanAccessTeamEntry(s, entry("other-mgr", "A"))).toThrow(AuthError);
  });

  it("allows a league admin of the auction's league", () => {
    const s = session("la", [{ leagueId: "A", role: "LEAGUE_ADMIN" }]);
    expect(() => assertCanAccessTeamEntry(s, entry("other-mgr", "A"))).not.toThrow();
  });

  it("allows the site admin regardless of league", () => {
    const s = session("root", [], true);
    expect(() => assertCanAccessTeamEntry(s, entry("other-mgr", "Z"))).not.toThrow();
  });

  it("rejects a league admin of another league who is only a viewer here", () => {
    const s = session("la", [
      { leagueId: "A", role: "LEAGUE_ADMIN" },
      { leagueId: "B", role: "VIEWER" },
    ]);
    expect(() => assertCanAccessTeamEntry(s, entry("other-mgr", "B"))).toThrow(AuthError);
  });

  it("allows a league admin who also manages one team to reach the league's other teams", () => {
    const s = session("la", [
      { leagueId: "A", role: "LEAGUE_ADMIN" },
      { leagueId: "A", role: "TEAM_MANAGER" },
    ]);
    expect(() => assertCanAccessTeamEntry(s, entry("other-mgr", "A"))).not.toThrow();
  });

  it("rejects a plain viewer of the league", () => {
    const s = session("v", [{ leagueId: "A", role: "VIEWER" }]);
    expect(() => assertCanAccessTeamEntry(s, entry("other-mgr", "A"))).toThrow(AuthError);
  });
});
