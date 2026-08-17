export type Commitment = { label: string; amount: number };

/**
 * Given a budget and a set of known/estimated future commitments, how much
 * is left for anything else. Each commitment is clamped at 0 here (not just
 * expected to arrive pre-clamped) — this is the one place that fixes the
 * Excel's overshoot bug (a commitment already exceeded should reserve
 * nothing further, never go negative and eat into capacity that should be
 * available). The shared core behind both the wishlist-feasibility and
 * rival-category-affordability computations.
 */
export function computeRemainingCapacity(budgetRemaining: number, commitments: Commitment[]): number {
  const reserved = commitments.reduce((sum, c) => sum + Math.max(c.amount, 0), 0);
  return Math.max(budgetRemaining - reserved, 0);
}
