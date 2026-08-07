import { describe, it, expect } from "vitest";
import { computeBidGuidance, computeLiveCategoryAvgPrice } from "./guidance";

const base = {
  basePrice: 100,
  isMustHave: false,
  isAvoid: false,
  categoryTargetAvgPrice: null,
  liveCategoryAvgPrice: null,
  legalMaxBid: 500,
  otherMustHavesRemainingInCategory: 0,
  predictedRival: null,
};

describe("computeBidGuidance", () => {
  it("passes on an avoid-marked player with no predicted rival", () => {
    const result = computeBidGuidance({ ...base, isAvoid: true });
    expect(result).toEqual({
      signal: "PASS",
      suggestedMaxBid: null,
      reason: "You marked this player as one to avoid",
    });
  });

  it("suggests a spoiler bid short of the predicted rival's estimated ceiling", () => {
    const result = computeBidGuidance({
      ...base,
      isAvoid: true,
      predictedRival: { teamName: "Titans FC", amount: 380 },
    });
    // floor(380 * 0.9) = 342
    expect(result.signal).toBe("SPOILER");
    expect(result.suggestedMaxBid).toBe(342);
  });

  it("suggests a spoiler signal with no ceiling when the rival's amount is unknown", () => {
    const result = computeBidGuidance({
      ...base,
      isAvoid: true,
      predictedRival: { teamName: "Titans FC", amount: null },
    });
    expect(result.signal).toBe("SPOILER");
    expect(result.suggestedMaxBid).toBeNull();
  });

  it("still passes on an avoid pick if it's already outside the legal max, even with a predicted rival", () => {
    const result = computeBidGuidance({
      ...base,
      isAvoid: true,
      legalMaxBid: 50, // below basePrice of 100
      predictedRival: { teamName: "Titans FC", amount: 380 },
    });
    expect(result.signal).toBe("PASS");
  });

  it("passes when there's no legal max at all", () => {
    const result = computeBidGuidance({ ...base, legalMaxBid: null });
    expect(result.signal).toBe("PASS");
    expect(result.suggestedMaxBid).toBeNull();
  });

  it("passes with the legal max as suggestedMaxBid when it's below base price", () => {
    const result = computeBidGuidance({ ...base, legalMaxBid: 80 });
    expect(result.signal).toBe("PASS");
    expect(result.suggestedMaxBid).toBe(80);
  });

  it("bids up to the legal max for a must-have pick", () => {
    const result = computeBidGuidance({ ...base, isMustHave: true });
    expect(result).toEqual({
      signal: "BID",
      suggestedMaxBid: 500,
      reason: "Must-have pick — go up to your legal max",
    });
  });

  it("bids cautiously when other must-haves are still to come in the category", () => {
    // reserve = 150 * 2 = 300; cautiousMaxBid = 500 - 300 = 200 >= basePrice(100)
    const result = computeBidGuidance({
      ...base,
      categoryTargetAvgPrice: 150,
      otherMustHavesRemainingInCategory: 2,
    });
    expect(result.signal).toBe("CONSIDER");
    expect(result.suggestedMaxBid).toBe(200);
  });

  it("passes when reserving for other must-haves would leave too little to bid at all", () => {
    // reserve = 150 * 2 = 300; cautiousMaxBid = 250 - 300 = -50 < basePrice(100)
    const result = computeBidGuidance({
      ...base,
      legalMaxBid: 250,
      categoryTargetAvgPrice: 150,
      otherMustHavesRemainingInCategory: 2,
    });
    expect(result.signal).toBe("PASS");
    expect(result.suggestedMaxBid).toBe(0);
  });

  it("considers within a manager-set budget target", () => {
    const result = computeBidGuidance({ ...base, categoryTargetAvgPrice: 200 });
    expect(result.signal).toBe("CONSIDER");
    expect(result.suggestedMaxBid).toBe(200);
  });

  it("passes when base price already exceeds the budget target", () => {
    const result = computeBidGuidance({ ...base, basePrice: 300, categoryTargetAvgPrice: 200 });
    expect(result.signal).toBe("PASS");
    expect(result.suggestedMaxBid).toBe(200);
  });

  it("falls back to the legal max with a neutral signal when no target or live average exists", () => {
    const result = computeBidGuidance(base);
    expect(result).toEqual({
      signal: "CONSIDER",
      suggestedMaxBid: 500,
      reason: "No budget target or category sales yet — showing your legal max",
    });
  });
});

describe("computeLiveCategoryAvgPrice", () => {
  it("is null when nothing in the category has sold yet", () => {
    expect(
      computeLiveCategoryAvgPrice(
        [{ categoryName: "Icon", status: "AVAILABLE", soldPrice: null }],
        "Icon"
      )
    ).toBeNull();
  });

  it("averages sold prices within the given category only", () => {
    const players = [
      { categoryName: "Icon", status: "SOLD", soldPrice: "300" },
      { categoryName: "Icon", status: "SOLD", soldPrice: "500" },
      { categoryName: "Regular", status: "SOLD", soldPrice: "50" },
    ];
    expect(computeLiveCategoryAvgPrice(players, "Icon")).toBe(400);
  });
});
