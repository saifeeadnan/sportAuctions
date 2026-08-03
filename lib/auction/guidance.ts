export type GuidanceSignal = "BID" | "CONSIDER" | "PASS" | "SPOILER";

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

/** The actual average sold price for a category so far in this auction — a
 * live, objective read of what this category is going for, distinct from
 * (and a fallback for) the manager's own pre-set budget target. */
export function computeLiveCategoryAvgPrice(
  players: { categoryName: string; status: string; soldPrice: string | null }[],
  categoryName: string
): number | null {
  const sold = players.filter(
    (p) => p.categoryName === categoryName && p.status === "SOLD" && p.soldPrice != null
  );
  if (sold.length === 0) return null;
  const total = sold.reduce((sum, p) => sum + Number(p.soldPrice), 0);
  return total / sold.length;
}

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
  /** Actual average sold price for this category so far in this auction, if
   * anything in it has sold yet — used as a live fallback wherever a target
   * price is needed and the manager hasn't set one explicitly. */
  liveCategoryAvgPrice: number | null;
  legalMaxBid: number | null;
  /** Count of the manager's OTHER must-have players — not this one — still
   * in play (not sold) in this same category. Used to caution against
   * spending aggressively on a non-priority pick when a priority pick in
   * the same category is still to come. Irrelevant, and ignored, when this
   * player is itself a must-have. */
  otherMustHavesRemainingInCategory: number;
  /** Your own prediction for who wins THIS player, if you made one — only
   * acted on when isAvoid is true, as a spoiler-bid candidate: someone
   * you've predicted a rival wants, that you could bid up to make them pay
   * more, without intending to actually win it yourself. */
  predictedRival: { teamName: string; amount: number | null } | null;
}): BidGuidance {
  const {
    basePrice,
    isMustHave,
    isAvoid,
    categoryTargetAvgPrice,
    liveCategoryAvgPrice,
    legalMaxBid,
    otherMustHavesRemainingInCategory,
    predictedRival,
  } = input;

  if (isAvoid) {
    const canLegallyBid = legalMaxBid != null && legalMaxBid >= basePrice;

    if (canLegallyBid && predictedRival) {
      if (predictedRival.amount != null) {
        // Bid up toward — but deliberately short of — your own predicted
        // price for the rival, so their spend goes up without you actually
        // needing to beat your own estimate of their ceiling.
        const spoilerCeiling = Math.min(
          legalMaxBid,
          Math.max(basePrice, Math.floor(predictedRival.amount * 0.9))
        );
        return {
          signal: "SPOILER",
          suggestedMaxBid: spoilerCeiling,
          reason: `You predicted ${predictedRival.teamName} would pay around ${predictedRival.amount} for this avoid pick — bidding up to ${spoilerCeiling} pushes their spend up. Risky: if nobody else bids, you could end up winning it at that price.`,
        };
      }
      return {
        signal: "SPOILER",
        suggestedMaxBid: null,
        reason: `You predicted ${predictedRival.teamName} would win this avoid pick, but haven't estimated an amount — add one in the Predictions tab for a specific ceiling. Only bid here if you're willing to risk winning it.`,
      };
    }

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
    // the live category average if anything's sold yet, else just base price.
    const perPickReserve = categoryTargetAvgPrice ?? liveCategoryAvgPrice ?? basePrice;
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

  const effectiveTarget = categoryTargetAvgPrice ?? liveCategoryAvgPrice;
  if (effectiveTarget != null) {
    const suggestedMaxBid = Math.min(legalMaxBid, effectiveTarget);
    const source = categoryTargetAvgPrice != null ? "your budget target" : "the live category average";
    const displayTarget = Math.round(effectiveTarget);
    return suggestedMaxBid >= basePrice
      ? {
          signal: "CONSIDER",
          suggestedMaxBid,
          reason: `Within ${source} for this category (${displayTarget})`,
        }
      : {
          signal: "PASS",
          suggestedMaxBid,
          reason: `Base price already exceeds ${source} for this category (${displayTarget})`,
        };
  }

  return {
    signal: "CONSIDER",
    suggestedMaxBid: legalMaxBid,
    reason: "No budget target or category sales yet — showing your legal max",
  };
}
