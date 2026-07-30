/**
 * The most a team can legally bid on the player currently on the clock
 * without leaving itself unable to fill its remaining squad slots afterward.
 * Reserves the cheapest players actually left in the pool (excluding the one
 * on the clock) for the slots that still need filling, rather than assuming
 * a flat per-slot minimum — a category can dry up before a team's slots do.
 */
export function computeMaxBid(
  remainingPoolBasePrices: number[],
  budgetRemaining: number,
  slotsRemaining: number
): number {
  if (slotsRemaining <= 0) return 0;
  const slotsAfterThisPick = slotsRemaining - 1;
  if (slotsAfterThisPick <= 0) return budgetRemaining;
  const reserve = [...remainingPoolBasePrices]
    .sort((a, b) => a - b)
    .slice(0, slotsAfterThisPick)
    .reduce((sum, p) => sum + p, 0);
  return budgetRemaining - reserve;
}
