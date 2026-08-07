import { describe, it, expect } from "vitest";
import { computeMaxBid } from "./maxBid";

describe("computeMaxBid", () => {
  it("returns 0 when no slots remain", () => {
    expect(computeMaxBid([100, 200], 5000, 0)).toBe(0);
    expect(computeMaxBid([], 5000, -1)).toBe(0);
  });

  it("returns the full remaining budget when this is the last slot", () => {
    expect(computeMaxBid([100, 200, 300], 5000, 1)).toBe(5000);
  });

  it("reserves the cheapest players in the pool for the remaining slots after this one", () => {
    // 3 slots remaining -> 2 slots to reserve for after this pick.
    // Cheapest 2 of [50, 100, 30, 80] are [30, 50] -> reserve 80.
    expect(computeMaxBid([50, 100, 30, 80], 500, 3)).toBe(420);
  });

  it("can go negative when the pool can't actually fill the remaining slots at their base prices", () => {
    // 1 slot to reserve after this pick, cheapest remaining is 400, budget only 300.
    expect(computeMaxBid([400], 300, 2)).toBe(-100);
  });
});
