import type { TeamProjection } from "@/lib/auction/projectedStandings";

// computeTeamStrength's ceiling (avgSkill maxes at 10, balance at 1) — a fixed
// reference so bar widths reflect distance from a hypothetical max-strength
// team, not just whichever team happens to be highest right now.
const STRENGTH_SCALE_MAX = 10;

export function TeamProjectionBoard({
  projections,
  myTeamId,
}: {
  projections: TeamProjection[];
  myTeamId?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {projections.map((p, i) => {
        const isMine = p.teamId === myTeamId;
        const widthPct = Math.min(100, (p.projectedStrength.teamStrength / STRENGTH_SCALE_MAX) * 100);
        return (
          <div key={p.teamId} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-xs text-black/40 dark:text-white/40 text-right tabular-nums">
                {i + 1}
              </span>
              <span
                className={`w-28 shrink-0 truncate text-sm ${isMine ? "font-semibold text-indigo-700 dark:text-indigo-300" : ""}`}
              >
                {p.teamName}
                {isMine ? " (you)" : ""}
              </span>
              <div className="flex-1 h-2.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full ${isMine ? "bg-indigo-600 dark:bg-indigo-500" : "bg-black/25 dark:bg-white/30"}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-sm font-medium text-right tabular-nums">
                {p.projectedStrength.teamStrength.toFixed(1)}
              </span>
              <span className="w-24 shrink-0 text-xs text-black/50 dark:text-white/50 text-right tabular-nums">
                {p.actualStrength.teamStrength.toFixed(1)} so far
              </span>
            </div>
            <p className="pl-7 text-xs text-black/50 dark:text-white/50 tabular-nums">
              Budget remaining: {p.budgetRemaining}
              {p.predictedReserve > 0 && (
                <>
                  {" "}
                  &middot; Your predicted reserve:{" "}
                  <span className="text-black/70 dark:text-white/70">
                    {p.predictedReserve.toLocaleString()}
                  </span>
                </>
              )}
            </p>
          </div>
        );
      })}
      {projections.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">No teams to compare yet.</p>
      )}
    </div>
  );
}
