import { describe, it, expect } from "vitest";
import {
  computeProjectedStandings,
  computeCategorySpendOverview,
  computeRivalAffordabilityWarnings,
  type PlayerPrediction,
} from "./projectedStandings";
import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/services/auctionState.service";

function player(overrides: Partial<AuctionStatePlayer>): AuctionStatePlayer {
  return {
    id: "p",
    name: "Player",
    position: null,
    age: null,
    photoUrl: null,
    previousTeam: null,
    categoryName: "Regular",
    basePrice: "100",
    bidIncrement: null,
    status: "AVAILABLE",
    soldPrice: null,
    soldToEntryId: null,
    soldToTeamName: null,
    soldVia: null,
    soldAt: null,
    currentBid: null,
    currentBidderEntryId: null,
    currentBidderTeamName: null,
    bidCount: 0,
    bidCooldownUntil: null,
    lotTimerDeadline: null,
    rating: null,
    battingRating: null,
    bowlingRating: null,
    fieldingRating: null,
    ...overrides,
  };
}

function team(overrides: Partial<AuctionStateTeam>): AuctionStateTeam {
  return {
    id: "t",
    teamId: "t",
    teamName: "Team",
    status: "AUCTION_LIVE",
    budgetRemaining: "500",
    slotsFilled: 0,
    slotsTotal: 11,
    hasSponsorImage: false,
    ...overrides,
  };
}

const teamA = team({ id: "teamA", teamName: "Knights", budgetRemaining: "500" });
const teamB = team({ id: "teamB", teamName: "Warriors", budgetRemaining: "30" });

const p1 = player({
  id: "p1",
  categoryName: "Icon",
  basePrice: "300",
  status: "SOLD",
  soldToEntryId: "teamA",
  soldPrice: "300",
});
const p2 = player({
  id: "p2",
  categoryName: "Regular",
  basePrice: "100",
  status: "AVAILABLE",
});
const p3 = player({
  id: "p3",
  categoryName: "Regular",
  basePrice: "100",
  status: "SOLD",
  soldToEntryId: "teamB",
  soldPrice: "80",
});

const predictions: Record<string, PlayerPrediction> = {
  p2: { teamId: "teamB", amount: 50 },
};

describe("computeProjectedStandings", () => {
  const projections = computeProjectedStandings([p1, p2, p3], [teamA, teamB], predictions);

  it("counts real sold players against the team that actually won them", () => {
    const a = projections.find((p) => p.teamId === "teamA")!;
    expect(a.rosterCount).toEqual({ sold: 1, predicted: 0 });
    expect(a.predictedReserve).toBe(0);
    expect(a.categoryCounts.Icon).toEqual({ sold: 1, predicted: 0 });
  });

  it("adds a manager's own predicted-win players and their reserve to the predicted team only", () => {
    const b = projections.find((p) => p.teamId === "teamB")!;
    expect(b.rosterCount).toEqual({ sold: 1, predicted: 1 });
    expect(b.predictedReserve).toBe(50);
    expect(b.categoryCounts.Regular).toEqual({ sold: 1, predicted: 1 });
  });

  it("orders categories highest base price first", () => {
    const a = projections.find((p) => p.teamId === "teamA")!;
    expect(Object.keys(a.categoryCounts)).toEqual(["Icon", "Regular"]);
  });
});

describe("computeCategorySpendOverview", () => {
  const overview = computeCategorySpendOverview([p1, p2, p3], predictions);

  it("reports the real average sold price per category", () => {
    const icon = overview.find((c) => c.categoryName === "Icon")!;
    expect(icon.avgSpent).toBe(300);
    expect(icon.soldCount).toBe(1);

    const regular = overview.find((c) => c.categoryName === "Regular")!;
    expect(regular.avgSpent).toBe(80);
    expect(regular.soldCount).toBe(1);
  });

  it("reports the manager's own predicted average for still-available players only", () => {
    const icon = overview.find((c) => c.categoryName === "Icon")!;
    expect(icon.avgPredicted).toBeNull();
    expect(icon.predictedCount).toBe(0);

    const regular = overview.find((c) => c.categoryName === "Regular")!;
    expect(regular.avgPredicted).toBe(50);
    expect(regular.predictedCount).toBe(1);
  });
});

describe("computeRivalAffordabilityWarnings", () => {
  it("flags a team whose predicted reserve exceeds its real remaining budget", () => {
    const projections = computeProjectedStandings([p1, p2, p3], [teamA, teamB], predictions);
    const warnings = computeRivalAffordabilityWarnings(projections);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      teamId: "teamB",
      predictedTotal: 50,
      budgetRemaining: 30,
      overBy: 20,
    });
  });

  it("flags nothing when every team's predicted reserve fits their budget", () => {
    const richTeamB = team({ id: "teamB", teamName: "Warriors", budgetRemaining: "1000" });
    const projections = computeProjectedStandings([p1, p2, p3], [teamA, richTeamB], predictions);
    expect(computeRivalAffordabilityWarnings(projections)).toHaveLength(0);
  });
});
