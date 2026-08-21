"use client";

import type { AuctionStatePlayer } from "@/lib/services/auctionState.service";
import type { OnClockTemplate, OnClockFieldKey } from "@/lib/onClockDisplay";
import { OnClockCard } from "@/components/auction/OnClockCard";
import { useLotTimer } from "@/hooks/useLotTimer";

/**
 * The broadcast page's on-clock display — renders the auction's own
 * configured on-clock template (Classic / Photo-focus / Stats table) at
 * broadcast size, exactly as the admin chose it for this auction, via the
 * same OnClockCard dispatcher the console uses. Adds the two pieces no
 * template renders at all: the live current bid and an oversized countdown
 * (both shown as separate siblings next to the card in the console too —
 * see LiveAuctionView.tsx's CurrentBidLine / OnClockTimer).
 */
export function BroadcastOnClockCard({
  player,
  template,
  visibleFields,
  photoWidth,
  photoHeight,
  totalSeconds,
}: {
  player: AuctionStatePlayer;
  template: OnClockTemplate;
  visibleFields: OnClockFieldKey[];
  photoWidth: number;
  photoHeight: number;
  totalSeconds: number | null;
}) {
  const { secondsRemaining, timeUp } = useLotTimer(player);
  const pct =
    totalSeconds && secondsRemaining != null
      ? Math.max(0, Math.min(100, (secondsRemaining / totalSeconds) * 100))
      : 100;

  return (
    <div className="flex flex-col items-center gap-4 max-w-2xl">
      <OnClockCard
        player={player}
        template={template}
        visibleFields={visibleFields}
        photoWidth={photoWidth}
        photoHeight={photoHeight}
      />

      {player.currentBid ? (
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-4xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
            {player.currentBid}
          </p>
          <p className="text-base text-black/60 dark:text-white/60">
            by{" "}
            <span className="font-semibold text-black dark:text-white">
              {player.currentBidderTeamName}
            </span>
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-4xl font-extrabold tabular-nums">{player.basePrice}</p>
          <p className="text-base text-black/60 dark:text-white/60">Base price — no bids yet</p>
        </div>
      )}

      {secondsRemaining != null && (
        <div className="w-full max-w-sm flex flex-col items-center gap-1.5">
          <span
            className={`text-2xl font-bold tabular-nums ${
              timeUp ? "text-red-600 dark:text-red-400" : "text-black/80 dark:text-white/80"
            }`}
          >
            {timeUp ? "Time's up" : `${secondsRemaining}s`}
          </span>
          <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                timeUp ? "bg-red-500" : "bg-emerald-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
