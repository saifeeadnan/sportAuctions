export type GuidanceSignal = "BID" | "CONSIDER" | "PASS";

export type BidGuidance = {
  signal: GuidanceSignal;
  suggestedMaxBid: number | null;
  reason: string;
};

/** A team's saved strategy inputs, shaped for both the guidance lookup
 * (by category name, matching AuctionStatePlayer.categoryName) and
 * StrategyForm's pre-fill (by category id). Shared by the live page (which
 * only needs it for the guidance signal) and the analytics popup page
 * (which also renders the editable form). */
export type InitialStrategy = {
  mustHaveIds: string[];
  avoidIds: string[];
  budgetTargetsByCategoryName: Record<string, number>;
  budgetTargets: { categoryId: string; targetAvgPrice: string }[];
};

/**
 * The manager's personalized bid/pass signal for the player currently on the
 * clock. `legalMaxBid` (from computeMaxBid, lib/auction/maxBid.ts) is always
 * the hard ceiling — this never suggests more than that, even for a
 * must-have, so the suggestion can never exceed what placeBid would actually
 * accept.
 */
export function computeBidGuidance(input: {
  basePrice: number;
  isMustHave: boolean;
  isAvoid: boolean;
  /** The manager's own target average spend for this player's category, if set. */
  categoryTargetAvgPrice: number | null;
  legalMaxBid: number | null;
  /** Count of the manager's OTHER must-have players — not this one — still
   * in play (not sold) in this same category. Used to caution against
   * spending aggressively on a non-priority pick when a priority pick in
   * the same category is still to come. Irrelevant, and ignored, when this
   * player is itself a must-have. */
  otherMustHavesRemainingInCategory: number;
}): BidGuidance {
  const {
    basePrice,
    isMustHave,
    isAvoid,
    categoryTargetAvgPrice,
    legalMaxBid,
    otherMustHavesRemainingInCategory,
  } = input;

  if (isAvoid) {
    return { signal: "PASS", suggestedMaxBid: null, reason: "You marked this player as one to avoid" };
  }

  if (legalMaxBid == null || legalMaxBid < basePrice) {
    return {
      signal: "PASS",
      suggestedMaxBid: legalMaxBid,
      reason: "Bidding would leave your team unable to fill its remaining slots",
    };
  }

  if (isMustHave) {
    return {
      signal: "BID",
      suggestedMaxBid: legalMaxBid,
      reason: "Must-have pick — go up to your legal max",
    };
  }

  if (otherMustHavesRemainingInCategory > 0) {
    // Best guess at what each still-to-come must-have will cost: the
    // manager's own budget target for this category if they set one, else
    // just the category's base price as a floor.
    const perPickReserve = categoryTargetAvgPrice ?? basePrice;
    const reserve = perPickReserve * otherMustHavesRemainingInCategory;
    const cautiousMaxBid = legalMaxBid - reserve;
    const pick = otherMustHavesRemainingInCategory === 1 ? "pick" : "picks";

    return cautiousMaxBid < basePrice
      ? {
          signal: "PASS",
          suggestedMaxBid: Math.max(0, cautiousMaxBid),
          reason: `You still have ${otherMustHavesRemainingInCategory} must-have ${pick} to come in this category — bidding here risks not being able to afford ${otherMustHavesRemainingInCategory === 1 ? "it" : "them"}`,
        }
      : {
          signal: "CONSIDER",
          suggestedMaxBid: cautiousMaxBid,
          reason: `Bid cautiously — ${otherMustHavesRemainingInCategory} must-have ${pick} still to come in this category`,
        };
  }

  if (categoryTargetAvgPrice != null) {
    const suggestedMaxBid = Math.min(legalMaxBid, categoryTargetAvgPrice);
    return suggestedMaxBid >= basePrice
      ? {
          signal: "CONSIDER",
          suggestedMaxBid,
          reason: `Within your budget target for this category (${categoryTargetAvgPrice})`,
        }
      : {
          signal: "PASS",
          suggestedMaxBid,
          reason: `Base price already exceeds your budget target for this category (${categoryTargetAvgPrice})`,
        };
  }

  return {
    signal: "CONSIDER",
    suggestedMaxBid: legalMaxBid,
    reason: "No budget target set for this category — showing your legal max",
  };
}
