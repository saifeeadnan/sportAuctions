import { describe, it, expect } from "vitest";
import { computeRivalRosters } from "./rivalRosters";
import { computeTeamStrength } from "@/lib/teamStrength";
import { toRatedPlayer } from "./playerValue";
import type { AnalyticsTeam, AnalyticsPlayer, SaleEvent, PlayerValueScore } from "./types";

const TEAMS: AnalyticsTeam[] = [
  { id: "alpha", name: "Alpha", budgetRemaining: 100, totalSlots: 15 },
  { id: "beta", name: "Beta", budgetRemaining: 250, totalSlots: 15 },
];

function player(id: string, categoryId: string, overrides: Partial<AnalyticsPlayer> = {}): AnalyticsPlayer {
  return { id, name: id, categoryId, basePrice: 0, ...overrides };
}

describe("computeRivalRosters", () => {
  it("groups each team's sales into its own roster, sorted by value descending", () => {
    const players = [player("p1", "gold"), player("p2", "gold"), player("p3", "silver")];
    const sales: SaleEvent[] = [
      { playerId: "p1", teamId: "alpha", price: 50, timestamp: "t1" },
      { playerId: "p2", teamId: "alpha", price: 30, timestamp: "t2" },
      { playerId: "p3", teamId: "beta", price: 10, timestamp: "t3" },
    ];
    const valueScores: PlayerValueScore[] = [
      { playerId: "p1", categoryId: "gold", skillScore: 5, replacementLevel: 5, value: 0 },
      { playerId: "p2", categoryId: "gold", skillScore: 9, replacementLevel: 5, value: 4 },
      { playerId: "p3", categoryId: "silver", skillScore: 3, replacementLevel: 3, value: 0 },
    ];

    const rosters = computeRivalRosters(TEAMS, players, sales, valueScores);
    const alpha = rosters.find((r) => r.teamId === "alpha")!;
    const beta = rosters.find((r) => r.teamId === "beta")!;

    // p2 (value 4) sorts before p1 (value 0), even though p1 sold first.
    expect(alpha.entries.map((e) => e.playerId)).toEqual(["p2", "p1"]);
    expect(alpha.entries[0].categoryId).toBe("gold");
    expect(alpha.entries[0].price).toBe(30);
    expect(beta.entries).toHaveLength(1);
    expect(beta.entries[0].playerId).toBe("p3");
  });

  it("passes through each team's current budgetRemaining unchanged", () => {
    const rosters = computeRivalRosters(TEAMS, [], [], []);
    expect(rosters.find((r) => r.teamId === "alpha")?.budgetRemaining).toBe(100);
    expect(rosters.find((r) => r.teamId === "beta")?.budgetRemaining).toBe(250);
  });

  it("computes team strength from that team's sold players, matching computeTeamStrength directly", () => {
    const players = [
      player("p1", "gold", { position: "Batsman", battingRating: 8 }),
      player("p2", "gold", { position: "Bowler", bowlingRating: 6 }),
    ];
    const sales: SaleEvent[] = [
      { playerId: "p1", teamId: "alpha", price: 50, timestamp: "t1" },
      { playerId: "p2", teamId: "alpha", price: 30, timestamp: "t2" },
    ];

    const rosters = computeRivalRosters(TEAMS, players, sales, []);
    const alpha = rosters.find((r) => r.teamId === "alpha")!;
    const beta = rosters.find((r) => r.teamId === "beta")!;

    expect(alpha.teamStrength).toBeCloseTo(computeTeamStrength(players.map(toRatedPlayer)).teamStrength);
    expect(alpha.teamStrength).toBeGreaterThan(0);
    // Beta has no sold players yet -> an empty roster's strength is 0.
    expect(beta.teamStrength).toBe(0);
  });

  it("returns an empty entries array for a team with no sales yet", () => {
    const rosters = computeRivalRosters(TEAMS, [], [], []);
    expect(rosters.every((r) => r.entries.length === 0)).toBe(true);
  });
});
