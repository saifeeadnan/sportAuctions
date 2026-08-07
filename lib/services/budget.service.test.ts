import { describe, it, expect } from "vitest";
import { computeManagerSlotPrice, computeReserveUnit, remainingSlots } from "./budget.service";

describe("computeManagerSlotPrice", () => {
  it("is always 0 when the manager doesn't occupy a slot", () => {
    expect(computeManagerSlotPrice(false, 500, 999).toNumber()).toBe(0);
  });

  it("prefers an explicit override over the manager's base price", () => {
    expect(computeManagerSlotPrice(true, 500, 250).toNumber()).toBe(250);
  });

  it("falls back to the manager's base price when no override is given", () => {
    expect(computeManagerSlotPrice(true, 500, null).toNumber()).toBe(500);
  });

  it("is 0 when the manager occupies a slot but has neither an override nor a base price", () => {
    expect(computeManagerSlotPrice(true, null, undefined).toNumber()).toBe(0);
  });
});

describe("computeReserveUnit", () => {
  it("is 0 for an empty category list", () => {
    expect(computeReserveUnit([]).toNumber()).toBe(0);
  });

  it("is the cheapest base price across all categories", () => {
    expect(
      computeReserveUnit([{ basePrice: 100 }, { basePrice: 50 }, { basePrice: 200 }]).toNumber()
    ).toBe(50);
  });
});

describe("remainingSlots", () => {
  it("is slotsTotal minus slotsFilled", () => {
    expect(remainingSlots({ slotsTotal: 10, slotsFilled: 4 })).toBe(6);
  });
});
