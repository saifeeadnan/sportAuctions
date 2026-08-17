import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import type { WishlistFeasibilitySummary } from "@/lib/auction-analytics/types";

const STATUS_LABEL: Record<WishlistFeasibilitySummary["status"], string> = {
  COMFORTABLE: "Comfortably covered",
  TIGHT: "Tight",
  SHORT: "Short",
};

const STATUS_VARIANT: Record<WishlistFeasibilitySummary["status"], "success" | "warning" | "danger"> = {
  COMFORTABLE: "success",
  TIGHT: "warning",
  SHORT: "danger",
};

/**
 * Just the Comfortable/Tight/Short status line from the wishlist feasibility
 * summary — kept on Live Analytics (a quick live gut-check) even though the
 * full player-by-player table now lives on Strategy, next to where the
 * wishlist itself gets set.
 */
export function WishlistStatusBadge({
  summary,
  hasItems,
}: {
  summary: WishlistFeasibilitySummary;
  hasItems: boolean;
}) {
  if (!hasItems) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        No must-have players set — mark some in Strategy to track their live status.
      </p>
    );
  }

  return (
    <div className={`${card} px-4 py-3 flex items-center justify-between gap-3 flex-wrap`}>
      <div className="flex items-center gap-2">
        <Badge variant={STATUS_VARIANT[summary.status]}>{STATUS_LABEL[summary.status]}</Badge>
        <span className="text-sm text-black/60 dark:text-white/60">
          ~{Math.round(summary.totalEstimatedRemainingCost).toLocaleString()} estimated for what&apos;s
          still available
        </span>
      </div>
      <span className="text-sm text-black/60 dark:text-white/60">
        {summary.budgetRemaining.toLocaleString()} left
      </span>
    </div>
  );
}
