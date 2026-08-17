import { describe, it, expect } from "vitest";
import { computeRemainingCapacity } from "./remainingCapacity";

describe("computeRemainingCapacity", () => {
  it("subtracts reserved commitments from the budget", () => {
    expect(computeRemainingCapacity(100, [{ label: "a", amount: 30 }, { label: "b", amount: 20 }])).toBe(50);
  });

  it("clamps a single overshot commitment to 0 instead of going negative", () => {
    // Bug (1)/(2) from the Excel: a commitment that's already been exceeded
    // must reserve nothing further, not eat into remaining capacity.
    expect(computeRemainingCapacity(100, [{ label: "a", amount: -40 }])).toBe(100);
  });

  it("clamps the total at 0 when commitments exceed the budget", () => {
    expect(computeRemainingCapacity(50, [{ label: "a", amount: 40 }, { label: "b", amount: 30 }])).toBe(0);
  });

  it("returns the full budget when there are no commitments", () => {
    expect(computeRemainingCapacity(75, [])).toBe(75);
  });
});
