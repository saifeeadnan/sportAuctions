"use client";

import { useLotTimer } from "@/hooks/useLotTimer";

/** Visual-only countdown shown next to the on-clock card. Renders nothing
 * when this auction has no timer configured (lotTimerDeadline is always
 * null in that case). Never resolves anything itself — the auctioneer
 * still clicks Record sale / Mark unsold exactly like today. */
export function OnClockTimer({
  player,
  totalSeconds,
}: {
  player: { lotTimerDeadline: string | null };
  totalSeconds: number | null;
}) {
  const { secondsRemaining, timeUp } = useLotTimer(player);
  if (secondsRemaining == null) return null;

  const pct = totalSeconds ? Math.max(0, Math.min(100, (secondsRemaining / totalSeconds) * 100)) : 100;

  return (
    <div className="w-full max-w-[200px] flex flex-col items-center gap-1">
      <span
        className={`text-lg font-semibold tabular-nums ${
          timeUp ? "text-red-600 dark:text-red-400" : "text-black/80 dark:text-white/80"
        }`}
      >
        {timeUp ? "Time's up" : `${secondsRemaining}s`}
      </span>
      <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            timeUp ? "bg-red-500" : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
