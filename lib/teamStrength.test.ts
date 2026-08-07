import { describe, it, expect } from "vitest";
import { groupPosition, skillScore, computeTeamStrength, type RatedPlayer } from "./teamStrength";

function player(overrides: Partial<RatedPlayer> = {}): RatedPlayer {
  return {
    position: null,
    rating: null,
    battingRating: null,
    bowlingRating: null,
    fieldingRating: null,
    ...overrides,
  };
}

describe("groupPosition", () => {
  it("normalizes common spellings, spacing, and case", () => {
    expect(groupPosition("Batsman")).toBe("Batsmen");
    expect(groupPosition("batsmen")).toBe("Batsmen");
    expect(groupPosition("BOWLER")).toBe("Bowlers");
    expect(groupPosition("All-Rounder")).toBe("All-rounders");
    expect(groupPosition("All Rounders")).toBe("All-rounders");
  });

  it("falls back to Other for null or unrecognized values", () => {
    expect(groupPosition(null)).toBe("Other");
    expect(groupPosition("Wicketkeeper")).toBe("Other");
  });
});

describe("skillScore", () => {
  it("returns 0 when no rating fields are present at all", () => {
    expect(skillScore(player())).toBe(0);
  });

  it("averages the position-relevant rating with fielding", () => {
    // Batsman: primary = battingRating (8), fielding = 6 -> (8 + 6) / 2 = 7
    expect(skillScore(player({ position: "Batsman", battingRating: "8", fieldingRating: "6" }))).toBe(7);
  });

  it("falls back to the normalized overall rating when no position-specific rating exists", () => {
    // rating is out of 100, normalized to /10 -> 45/10 = 4.5, no fielding to average with
    expect(skillScore(player({ position: "Batsman", rating: "45" }))).toBe(4.5);
  });

  it("averages batting and bowling for all-rounders when both are present", () => {
    expect(
      skillScore(player({ position: "All-rounder", battingRating: "6", bowlingRating: "8" }))
    ).toBe(7);
  });
});

describe("computeTeamStrength", () => {
  it("returns zeroed-out values for an empty squad", () => {
    const result = computeTeamStrength([]);
    expect(result.avgSkill).toBe(0);
    expect(result.balance).toBe(1);
    expect(result.teamStrength).toBe(0);
    expect(result.positionCounts).toEqual({
      Batsmen: 0,
      Bowlers: 0,
      "All-rounders": 0,
      Other: 0,
    });
  });

  it("penalizes a lopsided single-position squad via the balance multiplier", () => {
    const result = computeTeamStrength([
      player({ position: "Batsman", battingRating: "8", fieldingRating: "6" }),
    ]);
    expect(result.positionCounts.Batsmen).toBe(1);
    expect(result.avgSkill).toBe(7);
    expect(result.balance).toBeCloseTo(0.72, 5);
    expect(result.teamStrength).toBeCloseTo(5.04, 5);
  });
});
