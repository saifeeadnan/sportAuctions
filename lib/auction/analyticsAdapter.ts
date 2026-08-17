import { prisma } from "@/lib/prisma";
import { getAuctionState } from "@/lib/services/auctionState.service";
import type { AuctionAnalyticsSnapshot } from "@/lib/auction-analytics/types";

/**
 * The only file allowed to know about this app's real Prisma schema on
 * behalf of `lib/auction-analytics/` — maps this app's actual auction data
 * into the module's generic input contract. A Mode-2 (standalone/manual
 * entry) session would have its own equivalent adapter producing the exact
 * same `AuctionAnalyticsSnapshot` shape from its own Standalone* models.
 */
export async function loadAuctionAnalyticsSnapshot(
  auctionId: string,
  selfTeamEntryId: string
): Promise<AuctionAnalyticsSnapshot | null> {
  const [state, categories, preferences, rivalEstimates] = await Promise.all([
    getAuctionState(auctionId),
    prisma.auctionCategory.findMany({ where: { auctionId } }),
    prisma.auctionPlayerPreference.findMany({ where: { teamAuctionEntryId: selfTeamEntryId } }),
    prisma.rivalCategoryBudgetEstimate.findMany({ where: { teamAuctionEntryId: selfTeamEntryId } }),
  ]);
  if (!state) return null;

  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

  return {
    // TeamAuctionEntry.budgetRemaining is already authoritative and current
    // — trusted directly rather than reconstructed. A manager's own
    // base-price slot fee, in particular, is deducted here at creation time
    // with no corresponding AuctionPlayer sale row, so "remaining +
    // sum(sales)" would silently undercount the true starting budget.
    teams: state.teams.map((t) => ({
      id: t.id,
      name: t.teamName,
      budgetRemaining: Number(t.budgetRemaining),
      totalSlots: t.slotsTotal,
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      basePrice: Number(c.basePrice),
    })),
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      categoryId: categoryIdByName.get(p.categoryName) ?? p.categoryName,
      basePrice: Number(p.basePrice),
      position: p.position,
      rating: p.rating != null ? Number(p.rating) : null,
      battingRating: p.battingRating != null ? Number(p.battingRating) : null,
      bowlingRating: p.bowlingRating != null ? Number(p.bowlingRating) : null,
      fieldingRating: p.fieldingRating != null ? Number(p.fieldingRating) : null,
    })),
    sales: state.players
      .filter((p) => p.status === "SOLD" && p.soldToEntryId && p.soldPrice != null)
      .map((p) => ({
        playerId: p.id,
        teamId: p.soldToEntryId!,
        price: Number(p.soldPrice),
        timestamp: p.soldAt ?? "",
      })),
    unsold: state.players
      .filter((p) => p.status === "UNSOLD")
      .map((p) => ({ playerId: p.id, timestamp: "" })),
    selfTeamId: selfTeamEntryId,
    wishlist: preferences.map((pref) => ({ playerId: pref.auctionPlayerId, type: pref.type })),
    rivalEstimates: rivalEstimates.map((e) => ({
      targetTeamId: e.targetEntryId,
      categoryId: e.categoryId,
      estimatedBudget: Number(e.estimatedBudget),
    })),
  };
}
