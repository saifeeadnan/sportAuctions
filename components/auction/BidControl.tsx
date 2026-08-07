"use client";

import { useState } from "react";
import { placeBidAction } from "@/lib/actions/bidding.actions";
import type { AuctionStatePlayer } from "@/lib/services/auctionState.service";
import { useBidTiming } from "@/hooks/useBidTiming";
import { buttonPrimary } from "@/lib/ui";

function formatAmount(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function BidControl({
  auctionId,
  player,
  teamEntryId,
  slotsFilled,
  slotsTotal,
  maxBid,
}: {
  auctionId: string;
  player: AuctionStatePlayer;
  teamEntryId: string;
  slotsFilled: number;
  slotsTotal: number;
  /** The reserve-aware ceiling shown above this control — disables bidding
   * once the relevant amount would exceed it, rather than letting the
   * server be the only thing that catches it. */
  maxBid?: number | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { increment, cooldownMs, onCooldown, minNext } = useBidTiming(player);
  const isLeading = player.currentBidderEntryId === teamEntryId;
  const noRoom = slotsFilled >= slotsTotal;
  const quickBidExceedsMax = maxBid != null && minNext > maxBid;

  async function submit(value: number) {
    setLoading(true);
    setError(null);
    try {
      await placeBidAction(auctionId, player.id, teamEntryId, value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bid");
    } finally {
      setLoading(false);
    }
  }

  if (isLeading) {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
        You&apos;re the highest bidder.
      </p>
    );
  }
  if (noRoom) {
    return <p className="text-sm text-black/50 dark:text-white/50">Your squad is full.</p>;
  }
  if (increment == null) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        Ask the auctioneer to set a bid increment for this category before bidding.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={loading || onCooldown || quickBidExceedsMax}
        onClick={() => submit(minNext)}
        className={`${buttonPrimary} self-start`}
      >
        {onCooldown
          ? `Wait ${Math.ceil(cooldownMs / 1000)}s…`
          : loading
            ? "Bidding…"
            : `Bid ${formatAmount(minNext)}`}
      </button>
      {quickBidExceedsMax && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          That would exceed your max possible bid.
        </p>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
