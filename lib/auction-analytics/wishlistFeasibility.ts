import { computeRemainingCapacity } from "./remainingCapacity";
import type {
  AnalyticsTeam,
  AnalyticsPlayer,
  SaleEvent,
  WishlistEntry,
  PlayerValueScore,
  WishlistItemStatus,
  WishlistFeasibilitySummary,
} from "./types";

// How much of the manager's free capacity their remaining must-haves can
// use up before the status tips from "comfortable" to "tight" — a tunable
// judgment call, not derived from anything. Revisit once there's real data
// to check it against (see plan).
const TIGHT_THRESHOLD_FRACTION = 0.7;

/**
 * A manager's own MUST_HAVE wishlist, live: which picks are already
 * resolved (won/lost), and — for what's still available — an estimated
 * price and whether the combined remaining wishlist still fits inside the
 * team's remaining budget. Informative only: a status, never a directive.
 */
export function computeWishlistFeasibility(
  selfTeam: AnalyticsTeam,
  players: AnalyticsPlayer[],
  sales: SaleEvent[],
  wishlist: WishlistEntry[],
  valueScores: PlayerValueScore[]
): WishlistFeasibilitySummary {
  const mustHaves = wishlist.filter((w) => w.type === "MUST_HAVE");
  const saleByPlayerId = new Map(sales.map((s) => [s.playerId, s]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const valueByPlayerId = new Map(valueScores.map((v) => [v.playerId, v.value]));

  const budgetRemaining = Math.max(selfTeam.budgetRemaining, 0);

  // This category's live average sold price so far — the estimate basis for
  // an unresolved must-have, falling back to its own base price if nothing
  // in its category has sold yet.
  const categoryTotals = new Map<string, { sum: number; count: number }>();
  for (const sale of sales) {
    const categoryId = playerById.get(sale.playerId)?.categoryId;
    if (!categoryId) continue;
    const entry = categoryTotals.get(categoryId) ?? { sum: 0, count: 0 };
    entry.sum += sale.price;
    entry.count += 1;
    categoryTotals.set(categoryId, entry);
  }

  const items: WishlistItemStatus[] = mustHaves.map((entry) => {
    const player = playerById.get(entry.playerId);
    const sale = saleByPlayerId.get(entry.playerId);
    const valueScore = valueByPlayerId.get(entry.playerId) ?? null;

    if (sale) {
      return {
        playerId: entry.playerId,
        status: sale.teamId === selfTeam.id ? "WON" : "LOST",
        estimatedPrice: null,
        valueScore,
      };
    }

    const totals = player ? categoryTotals.get(player.categoryId) : undefined;
    const estimatedPrice = totals && totals.count > 0 ? totals.sum / totals.count : (player?.basePrice ?? null);

    return { playerId: entry.playerId, status: "AVAILABLE", estimatedPrice, valueScore };
  });

  const totalEstimatedRemainingCost = items
    .filter((i) => i.status === "AVAILABLE")
    .reduce((sum, i) => sum + (i.estimatedPrice ?? 0), 0);

  const freeCapacity = computeRemainingCapacity(budgetRemaining, []);
  const status: WishlistFeasibilitySummary["status"] =
    totalEstimatedRemainingCost <= freeCapacity * TIGHT_THRESHOLD_FRACTION
      ? "COMFORTABLE"
      : totalEstimatedRemainingCost <= freeCapacity
        ? "TIGHT"
        : "SHORT";

  return { items, totalEstimatedRemainingCost, budgetRemaining, status };
}
