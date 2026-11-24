/**
 * The standalone Auction Analytics module's input/output contract — plain
 * data shapes, deliberately independent of this app's Prisma models. This
 * app's `lib/auction/analyticsAdapter.ts` maps real data into these types;
 * a manual/CSV-fed session (Mode 2) maps into the exact same types via its
 * own adapter. Everything under `lib/auction-analytics/` may depend on
 * these types (and on other equally generic, dependency-free utilities like
 * `lib/teamStrength.ts`) but never on Prisma or any app-specific model.
 */

// ---- Setup-time data ----

export type AnalyticsTeam = {
  id: string;
  name: string;
  /**
   * The team's *current* remaining budget, authoritative from the source
   * system — not an original starting figure to be re-derived from a sales
   * log. Deliberately not "startingBudget": some hosts (this app included,
   * via a manager's own base-price slot fee) deduct spend that never
   * appears as a normal per-player sale event, so reconstructing "starting"
   * from "remaining + sum(sales)" silently undercounts. Trusting whatever
   * the host already tracks as current is the only reliable option.
   */
  budgetRemaining: number;
  totalSlots: number;
};

export type AnalyticsCategory = {
  id: string;
  name: string;
  basePrice: number;
  /** Minimum raise between successive bids, if this category has one — a
   * simulated sale price snaps to this grid (basePrice + k * bidIncrement),
   * matching how real bids actually land rather than an arbitrary decimal. */
  bidIncrement: number | null;
};

export type AnalyticsPlayer = {
  id: string;
  name: string;
  categoryId: string;
  basePrice: number;
  position?: string | null;
  rating?: number | null;
  battingRating?: number | null;
  bowlingRating?: number | null;
  fieldingRating?: number | null;
};

// ---- Live event stream ----

export type SaleEvent = {
  playerId: string;
  teamId: string;
  price: number;
  timestamp: string;
};

export type UnsoldEvent = {
  playerId: string;
  timestamp: string;
};

// ---- Manager-opinion inputs ----

export type WishlistEntry = {
  playerId: string;
  type: "MUST_HAVE" | "AVOID";
};

export type RivalCategoryEstimateInput = {
  targetTeamId: string;
  categoryId: string;
  estimatedBudget: number;
};

/** This manager's own guess at who wins a not-yet-sold player, and for how
 * much — the ground truth the simulation engine honors deterministically
 * for that player, rather than randomizing it away (see simulateLot.ts). */
export type PlayerPredictionInput = {
  playerId: string;
  /** Null when the manager guessed only a price, with no team attached —
   * the simulation engine then treats this player as unpredicted (resolved
   * competitively), since there's no winner to deterministically assign. */
  predictedWinnerTeamId: string | null;
  /** Null when a team was predicted without an amount guess. Acts as a max
   * price (ceiling) wherever the engine resolves this player competitively. */
  predictedAmount: number | null;
  /** The low end of the guess, if one was given — acts as a min price
   * (floor) wherever the engine resolves this player competitively. */
  predictedMinAmount: number | null;
};

export type BudgetTargetInput = { categoryId: string; targetAvgPrice: number };

/** Everything a computation needs for one auction, from either ingestion
 * mode — the shape an adapter (Mode 1: `lib/auction/analyticsAdapter.ts`,
 * Mode 2: a future standalone adapter) produces and every panel consumes. */
export type AuctionAnalyticsSnapshot = {
  teams: AnalyticsTeam[];
  categories: AnalyticsCategory[];
  players: AnalyticsPlayer[];
  sales: SaleEvent[];
  unsold: UnsoldEvent[];
  selfTeamId: string;
  wishlist: WishlistEntry[];
  rivalEstimates: RivalCategoryEstimateInput[];
  predictions: PlayerPredictionInput[];
  budgetTargets: BudgetTargetInput[];
};

// ---- Outputs ----

export type PlayerValueScore = {
  playerId: string;
  categoryId: string;
  skillScore: number;
  replacementLevel: number;
  /** skillScore - replacementLevel — a Value-Based-Drafting-style "how much
   * better/worse than the weakest player still expected to get rostered in
   * this category" figure. */
  value: number;
};

export type WishlistItemStatus = {
  playerId: string;
  status: "AVAILABLE" | "WON" | "LOST";
  /** Only set while AVAILABLE — null once resolved (WON/LOST). */
  estimatedPrice: number | null;
  valueScore: number | null;
};

export type WishlistFeasibilitySummary = {
  items: WishlistItemStatus[];
  totalEstimatedRemainingCost: number;
  budgetRemaining: number;
  status: "COMFORTABLE" | "TIGHT" | "SHORT";
};

export type RivalCategoryAffordability = {
  teamId: string;
  categoryId: string;
  /** Null when this manager hasn't set an estimate for this team/category,
   * and couldn't infer one either. */
  estimatedBudget: number | null;
  /** True when estimatedBudget was inferred (this was the one category left
   * unspecified once every other category had an explicit estimate) rather
   * than typed in directly. */
  isInferred: boolean;
  actualSpent: number;
  actualCount: number;
  remainingEstimatedBudget: number | null;
  /** Null/0 once this category's estimated count is met or exceeded. */
  remainingEstimatedCount: number | null;
  /** Null once remainingEstimatedCount is 0 ("done") or no estimate exists. */
  estimatedAffordablePrice: number | null;
};
