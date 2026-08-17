import { describe, it, expect } from "vitest";
import { computePlayerValueScores } from "./playerValue";
import type { AnalyticsPlayer } from "./types";

function player(overrides: Partial<AnalyticsPlayer> & Pick<AnalyticsPlayer, "id" | "categoryId">): AnalyticsPlayer {
  return { name: overrides.id, basePrice: 0, ...overrides };
}

describe("computePlayerValueScores", () => {
  it("scores each player relative to the weakest player in the same category", () => {
    const players: AnalyticsPlayer[] = [
      player({ id: "a", categoryId: "gold", position: "Batsman", battingRating: 8, fieldingRating: 6 }),
      player({ id: "b", categoryId: "gold", position: "Batsman", battingRating: 4, fieldingRating: 4 }),
      player({ id: "c", categoryId: "silver", position: "Bowler", bowlingRating: 5 }),
    ];

    const scores = computePlayerValueScores(players);
    const byId = Object.fromEntries(scores.map((s) => [s.playerId, s]));

    expect(byId.a.skillScore).toBeCloseTo(7);
    expect(byId.b.skillScore).toBeCloseTo(4);
    // "gold" replacement level is the weaker of a/b (player b, score 4).
    expect(byId.a.replacementLevel).toBeCloseTo(4);
    expect(byId.a.value).toBeCloseTo(3);
    expect(byId.b.value).toBeCloseTo(0);

    // "silver" only has one player, so it's its own replacement level.
    expect(byId.c.replacementLevel).toBeCloseTo(5);
    expect(byId.c.value).toBeCloseTo(0);
  });

  it("returns an empty array for an empty pool", () => {
    expect(computePlayerValueScores([])).toEqual([]);
  });
});
