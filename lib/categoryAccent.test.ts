import { describe, it, expect } from "vitest";
import { categoryAccent, assignDistinctCategoryAccents } from "./categoryAccent";

describe("categoryAccent", () => {
  it("is deterministic for a given name", () => {
    expect(categoryAccent("Gold")).toEqual(categoryAccent("Gold"));
  });
});

describe("assignDistinctCategoryAccents", () => {
  it("never assigns the same color to two different categories, for any small set", () => {
    // A handful of realistic auction-category names, including "Icon" and
    // "Gold" — the exact pair a user reported colliding under the plain
    // hash-mod categoryAccent().
    const names = ["Icon", "Gold", "Silver", "Bronze", "Emerging", "Star"];
    const result = assignDistinctCategoryAccents(names);

    expect(result.size).toBe(names.length);
    const colors = names.map((n) => result.get(n)!.bar);
    expect(new Set(colors).size).toBe(names.length);
  });

  it("keeps each category's usual hash-derived color when nothing collides", () => {
    // A single category has nothing to collide with, so it should get
    // exactly what categoryAccent() would already give it.
    const result = assignDistinctCategoryAccents(["Gold"]);
    expect(result.get("Gold")).toEqual(categoryAccent("Gold"));
  });

  it("is stable across repeated calls with the same input", () => {
    const names = ["Icon", "Gold", "Silver"];
    const first = assignDistinctCategoryAccents(names);
    const second = assignDistinctCategoryAccents([...names].reverse());
    for (const name of names) {
      expect(second.get(name)).toEqual(first.get(name));
    }
  });

  it("deduplicates repeated names in the input", () => {
    const result = assignDistinctCategoryAccents(["Gold", "Gold", "Silver"]);
    expect(result.size).toBe(2);
  });

  it("returns an empty map for an empty input", () => {
    expect(assignDistinctCategoryAccents([]).size).toBe(0);
  });

  it("falls back to color reuse once there are more distinct categories than palette slots", () => {
    const names = Array.from({ length: 12 }, (_, i) => `Category ${i}`);
    const result = assignDistinctCategoryAccents(names);
    expect(result.size).toBe(12);
    // Can't stay distinct beyond the 7-hue palette — just prove every name
    // still gets *some* valid accent, no crash/undefined.
    for (const name of names) {
      expect(result.get(name)).toBeDefined();
    }
  });
});
