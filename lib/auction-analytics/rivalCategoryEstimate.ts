import { computeRemainingCapacity } from "./remainingCapacity";
import type {
  AnalyticsTeam,
  AnalyticsCategory,
  AnalyticsPlayer,
  SaleEvent,
  RivalCategoryEstimateInput,
  RivalCategoryAffordability,
} from "./types";

/**
 * Per team x category: how much of a rival's remaining budget this manager
 * estimates is still available for their next pick in that category, given
 * this manager's own budget estimates for every category (not just this
 * one).
 *
 * Ported from the Excel's "PL avg"/"G avg" cascade, generalized and fixed:
 *  - handles however many categories the auction has, not a hardcoded 2
 *    (Platinum-then-Gold)
 *  - clamps an overshot estimate (already spent/bought more than estimated)
 *    to "done", never divides by a negative remaining count
 *  - no hardcoded prices anywhere — categories' live/base prices come from
 *    real data
 *  - if exactly one category is left unestimated for a team, its budget
 *    isn't really unknown — it's inferred as whatever's left of the team's
 *    total spendable budget once the specified categories are accounted
 *    for, rather than treated as blank
 */
export function computeRivalCategoryEstimates(
  teams: AnalyticsTeam[],
  categories: AnalyticsCategory[],
  players: AnalyticsPlayer[],
  sales: SaleEvent[],
  estimates: RivalCategoryEstimateInput[]
): RivalCategoryAffordability[] {
  const categoryIdByPlayerId = new Map(players.map((p) => [p.id, p.categoryId]));
  const explicitEstimateByTeamCategory = new Map(
    estimates.map((e) => [`${e.targetTeamId}:${e.categoryId}`, e.estimatedBudget])
  );

  const results: RivalCategoryAffordability[] = [];

  for (const team of teams) {
    const teamSales = sales.filter((s) => s.teamId === team.id);
    const budgetRemaining = Math.max(team.budgetRemaining, 0);

    const actualByCategory = new Map<string, { spent: number; count: number }>();
    for (const sale of teamSales) {
      const categoryId = categoryIdByPlayerId.get(sale.playerId);
      if (!categoryId) continue;
      const entry = actualByCategory.get(categoryId) ?? { spent: 0, count: 0 };
      entry.spent += sale.price;
      entry.count += 1;
      actualByCategory.set(categoryId, entry);
    }

    // If every category but one has an explicit estimate for this team, the
    // last one isn't really unknown — infer it from what's left of the
    // team's total spendable budget (current remaining + everything already
    // spent, i.e. the budget available for auction picks specifically,
    // which excludes e.g. a manager's own fixed self-slot fee) once the
    // specified categories are subtracted out. Two or more missing
    // categories genuinely can't be disentangled from a single total, so
    // those are left alone.
    const categoryIds = categories.map((c) => c.id);
    const explicitCategoryIds = categoryIds.filter((id) =>
      explicitEstimateByTeamCategory.has(`${team.id}:${id}`)
    );
    const missingCategoryIds = categoryIds.filter((id) => !explicitCategoryIds.includes(id));

    const effectiveEstimateByCategory = new Map<string, { amount: number; inferred: boolean }>();
    for (const categoryId of explicitCategoryIds) {
      effectiveEstimateByCategory.set(categoryId, {
        amount: explicitEstimateByTeamCategory.get(`${team.id}:${categoryId}`)!,
        inferred: false,
      });
    }
    if (explicitCategoryIds.length > 0 && missingCategoryIds.length === 1) {
      const totalSpendableBudget = budgetRemaining + teamSales.reduce((sum, s) => sum + s.price, 0);
      const specifiedTotal = explicitCategoryIds.reduce(
        (sum, id) => sum + effectiveEstimateByCategory.get(id)!.amount,
        0
      );
      effectiveEstimateByCategory.set(missingCategoryIds[0], {
        amount: Math.max(totalSpendableBudget - specifiedTotal, 0),
        inferred: true,
      });
    }

    // This team's remaining estimated budget per category it has an
    // (explicit or inferred) estimate for — reused both as "what's left to
    // reserve" when computing every OTHER category's affordable price, and
    // as the numerator when it's this category's own turn.
    const remainingEstimatedBudgetByCategory = new Map<string, number>();
    for (const [categoryId, { amount }] of effectiveEstimateByCategory) {
      const actualSpent = actualByCategory.get(categoryId)?.spent ?? 0;
      remainingEstimatedBudgetByCategory.set(categoryId, Math.max(amount - actualSpent, 0));
    }

    for (const category of categories) {
      const effective = effectiveEstimateByCategory.get(category.id);
      const actual = actualByCategory.get(category.id) ?? { spent: 0, count: 0 };

      if (!effective) {
        results.push({
          teamId: team.id,
          categoryId: category.id,
          estimatedBudget: null,
          isInferred: false,
          actualSpent: actual.spent,
          actualCount: actual.count,
          remainingEstimatedBudget: null,
          remainingEstimatedCount: null,
          estimatedAffordablePrice: null,
        });
        continue;
      }

      // This category's live average sold price so far this auction,
      // falling back to base price before anything's sold in it — used to
      // convert a $ budget estimate into an estimated pick count.
      const categorySales = sales.filter((s) => categoryIdByPlayerId.get(s.playerId) === category.id);
      const liveAvgPrice =
        categorySales.length > 0
          ? categorySales.reduce((sum, s) => sum + s.price, 0) / categorySales.length
          : category.basePrice;

      const remainingEstimatedBudget = remainingEstimatedBudgetByCategory.get(category.id) ?? 0;
      const estimatedTotalCount = liveAvgPrice > 0 ? effective.amount / liveAvgPrice : 0;
      const remainingEstimatedCount = Math.max(Math.round(estimatedTotalCount) - actual.count, 0);

      let estimatedAffordablePrice: number | null = null;
      if (remainingEstimatedCount > 0) {
        const reservedForOtherCategories = Array.from(remainingEstimatedBudgetByCategory.entries())
          .filter(([categoryId]) => categoryId !== category.id)
          .reduce((sum, [, amount]) => sum + amount, 0);
        const availableForThisCategory = computeRemainingCapacity(budgetRemaining, [
          { label: "other categories", amount: reservedForOtherCategories },
        ]);
        estimatedAffordablePrice = availableForThisCategory / remainingEstimatedCount;
      }

      results.push({
        teamId: team.id,
        categoryId: category.id,
        estimatedBudget: effective.amount,
        isInferred: effective.inferred,
        actualSpent: actual.spent,
        actualCount: actual.count,
        remainingEstimatedBudget,
        remainingEstimatedCount,
        estimatedAffordablePrice,
      });
    }
  }

  return results;
}
