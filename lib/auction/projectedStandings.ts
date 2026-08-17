import { computeTeamStrength, type RatedPlayer } from "@/lib/teamStrength";
import { computeLiveCategoryAvgPrice } from "@/lib/auction/guidance";
import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/services/auctionState.service";

/** A manager's own private guess: which team wins this player, and
 * optionally how much that manager thinks it'll cost them. */
export type PlayerPrediction = { teamId: string; amount: number | null };

export type TeamProjection = {
  teamId: string;
  teamName: string;
  actualStrength: ReturnType<typeof computeTeamStrength>;
  projectedStrength: ReturnType<typeof computeTeamStrength>;
  projectedRosterSize: number;
  /** Same sold/predicted split as categoryCounts, but summed across every
   * category — the whole-roster equivalent of a category cell. */
  rosterCount: { sold: number; predicted: number };
  budgetRemaining: string;
  /** Sum of predicted-amount guesses across this team's still-available
   * predicted wins — a rough idea of how much of their budget is already
   * "spoken for" by picks other than whoever's on the clock right now. */
  predictedReserve: number;
  /** Sold vs. predicted-but-not-yet-sold player counts per auction
   * category — every category in the auction is present as a key for
   * every team (zeros where they have none), in a single order (highest
   * base price first) shared across every team so a table can use one
   * consistent, pre-sorted set of columns. */
  categoryCounts: Record<string, { sold: number; predicted: number }>;
};

const STILL_AVAILABLE_STATUSES = new Set(["AVAILABLE", "IN_PRE_AUCTION_POOL", "IN_BIDDING", "UNSOLD"]);

/** Highest base price first (same ordering StrategyForm/DraftForm already
 * use for their category tabs) — every player carries their own category's
 * base price, so one pass over the whole pool is enough to rank categories
 * without a separate lookup. */
export function rankCategoriesByBasePrice(players: { categoryName: string; basePrice: string }[]): string[] {
  const basePriceByName = new Map<string, number>();
  for (const p of players) {
    if (!basePriceByName.has(p.categoryName)) {
      basePriceByName.set(p.categoryName, Number(p.basePrice));
    }
  }
  return Array.from(basePriceByName.keys()).sort(
    (a, b) => (basePriceByName.get(b) ?? 0) - (basePriceByName.get(a) ?? 0)
  );
}

function toRatedPlayer(p: AuctionStatePlayer): RatedPlayer {
  return {
    position: p.position,
    rating: p.rating,
    battingRating: p.battingRating,
    bowlingRating: p.bowlingRating,
    fieldingRating: p.fieldingRating,
  };
}

/**
 * Per team: real sold players plus this manager's own private predictions for
 * who'll win each still-available player — never another team's predictions,
 * since those are never fetched for anyone but the caller. Sorted by
 * projected strength, same ranking signal fantasyTeam.service.ts's
 * getFantasyStandings already uses as its pre-real-points fallback.
 */
export function computeProjectedStandings(
  players: AuctionStatePlayer[],
  teams: AuctionStateTeam[],
  predictions: Record<string, PlayerPrediction>
): TeamProjection[] {
  const allCategories = rankCategoriesByBasePrice(players);

  const projections = teams.map((team) => {
    const actual = players.filter((p) => p.soldToEntryId === team.id);
    const predicted = players.filter(
      (p) => STILL_AVAILABLE_STATUSES.has(p.status) && predictions[p.id]?.teamId === team.id
    );
    const predictedReserve = predicted.reduce(
      (sum, p) => sum + (predictions[p.id]?.amount ?? 0),
      0
    );

    const categoryCounts: Record<string, { sold: number; predicted: number }> = Object.fromEntries(
      allCategories.map((c) => [c, { sold: 0, predicted: 0 }])
    );
    for (const p of actual) {
      categoryCounts[p.categoryName].sold += 1;
    }
    for (const p of predicted) {
      categoryCounts[p.categoryName].predicted += 1;
    }

    return {
      teamId: team.id,
      teamName: team.teamName,
      actualStrength: computeTeamStrength(actual.map(toRatedPlayer)),
      projectedStrength: computeTeamStrength([...actual, ...predicted].map(toRatedPlayer)),
      projectedRosterSize: actual.length + predicted.length,
      rosterCount: { sold: actual.length, predicted: predicted.length },
      budgetRemaining: team.budgetRemaining,
      predictedReserve,
      categoryCounts,
    };
  });

  return projections.sort((a, b) => b.projectedStrength.teamStrength - a.projectedStrength.teamStrength);
}

export type CategorySpendOverview = {
  categoryName: string;
  /** Real average of soldPrice across everything sold in this category so
   * far — null if nothing's sold yet. */
  avgSpent: number | null;
  soldCount: number;
  /** Average of the manager's own predicted amounts for still-available
   * players in this category — "based on their assumptions specified" in
   * the Predictions tab. Only counts predictions that included an amount;
   * null if none do. */
  avgPredicted: number | null;
  predictedCount: number;
};

/**
 * Per category, auction-wide: what's actually been paid so far vs. what the
 * manager's own predictions say is coming — a real-vs-assumed pairing,
 * ordered the same highest-base-price-first way as the standings table.
 */
export function computeCategorySpendOverview(
  players: AuctionStatePlayer[],
  predictions: Record<string, PlayerPrediction>
): CategorySpendOverview[] {
  return rankCategoriesByBasePrice(players).map((categoryName) => {
    const soldCount = players.filter(
      (p) => p.categoryName === categoryName && p.status === "SOLD" && p.soldPrice != null
    ).length;

    const predictedWithAmount = players.filter(
      (p) =>
        p.categoryName === categoryName &&
        STILL_AVAILABLE_STATUSES.has(p.status) &&
        predictions[p.id]?.amount != null
    );
    const avgPredicted =
      predictedWithAmount.length > 0
        ? predictedWithAmount.reduce((sum, p) => sum + (predictions[p.id]?.amount ?? 0), 0) /
          predictedWithAmount.length
        : null;

    return {
      categoryName,
      avgSpent: computeLiveCategoryAvgPrice(players, categoryName),
      soldCount,
      avgPredicted,
      predictedCount: predictedWithAmount.length,
    };
  });
}

export type RivalAffordabilityWarning = {
  teamId: string;
  teamName: string;
  predictedTotal: number;
  budgetRemaining: number;
  overBy: number;
};

/**
 * Flags any team where the manager's own predicted-win amounts (already
 * summed as TeamProjection.predictedReserve) add up to more than that
 * team's real remaining budget can cover — a sanity check on the
 * predictions themselves ("these can't all be right"), not a judgment on
 * any specific player or team.
 */
export function computeRivalAffordabilityWarnings(
  projections: TeamProjection[]
): RivalAffordabilityWarning[] {
  return projections
    .filter((p) => p.predictedReserve > Number(p.budgetRemaining))
    .map((p) => ({
      teamId: p.teamId,
      teamName: p.teamName,
      predictedTotal: p.predictedReserve,
      budgetRemaining: Number(p.budgetRemaining),
      overBy: p.predictedReserve - Number(p.budgetRemaining),
    }))
    .sort((a, b) => b.overBy - a.overBy);
}
