import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";

// lib/auth/guards.ts (imported transitively via lib/auth/scope.ts) imports
// the real "@/auth", which pulls in next-auth's own next/server import —
// that import chain doesn't resolve under Vitest's plain Node environment
// (it expects Next's own bundler). Nothing under test here ever calls the
// real auth() function, so it's stubbed out rather than actually loaded.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { loadScopedAuction } = await import("@/lib/auth/scope");
const { AuthError } = await import("@/lib/auth/guards");
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

    await expect(loadScopedAuction(auction.id, fixture.league.id)).resolves.toMatchObject({
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

    await expect(loadScopedAuction(auctionInLeagueA.id, fixtureB.league.id)).rejects.toThrow(AuthError);
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
