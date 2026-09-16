import { describe, it, expect } from "vitest";
import { countInCategory, isAtOrOverCap } from "./categoryCaps";

describe("countInCategory", () => {
  const players = [
    { soldToEntryId: "team-a", categoryName: "Icon" },
    { soldToEntryId: "team-a", categoryName: "Icon" },
    { soldToEntryId: "team-a", categoryName: "Regular" },
    { soldToEntryId: "team-b", categoryName: "Icon" },
    { soldToEntryId: null, categoryName: "Icon" },
  ];

  it("counts only the given team's players in the given category", () => {
    expect(countInCategory(players, "team-a", "Icon")).toBe(2);
  });

  it("ignores other categories and other teams", () => {
    expect(countInCategory(players, "team-a", "Regular")).toBe(1);
    expect(countInCategory(players, "team-b", "Icon")).toBe(1);
  });

  it("ignores unsold players (soldToEntryId null) and unknown teams", () => {
    expect(countInCategory(players, "team-c", "Icon")).toBe(0);
  });
});

describe("isAtOrOverCap", () => {
  it("is always false when no cap is configured", () => {
    expect(isAtOrOverCap(0, null)).toBe(false);
    expect(isAtOrOverCap(100, null)).toBe(false);
    expect(isAtOrOverCap(0, undefined)).toBe(false);
  });

  it("is true exactly at the cap and beyond, false below it", () => {
    expect(isAtOrOverCap(1, 2)).toBe(false);
    expect(isAtOrOverCap(2, 2)).toBe(true);
    expect(isAtOrOverCap(3, 2)).toBe(true);
  });
});
