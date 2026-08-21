"use client";

import { useEffect, useState } from "react";
import type { AuctionState } from "@/lib/services/auctionState.service";
import type { SponsorTier } from "@/lib/sponsorTiers";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { BroadcastOnClockCard } from "@/components/auction/BroadcastOnClockCard";
import { SaleAnnouncement } from "@/components/auction/SaleAnnouncement";
import { SoldTicker } from "@/components/auction/SoldTicker";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";
import { Badge } from "@/components/ui/Badge";

type Sponsor = {
  id: string;
  name: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  tier: SponsorTier;
};

/** Sizes the on-clock photo off the *actual* viewport/OBS canvas height
 * instead of a fixed guess — a fixed pixel size that "looks right" on one
 * window height silently pushes the price/timer below the fold on a
 * shorter one (a broadcast canvas can never scroll to reveal them, since
 * nothing ever interacts with it). Recomputed on resize; the photo gets
 * roughly a quarter of the viewport's height, leaving room for the header,
 * name/price/timer text, and the footer. */
function usePhotoSize() {
  const [size, setSize] = useState({ width: 176, height: 220 });
  useEffect(() => {
    function recompute() {
      const height = Math.max(120, Math.min(320, Math.round(window.innerHeight * 0.25)));
      setSize({ width: Math.round(height * 0.8), height });
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);
  return size;
}

/**
 * The OBS-friendly broadcast canvas: the on-clock player (in the auction's
 * own configured on-clock template), live bid, countdown, and sponsors — and
 * nothing an operator does (no controls, no nav — NavVisibility hides the
 * root layout's <Nav> on this route, and the `fixed inset-0` root paints
 * over the auctioneer layout's content column, same technique as the popup
 * analytics dashboards). Team rosters (SoldTicker) only appear during idle
 * moments — before the next player is selected, or once the auction has
 * completed — filling what would otherwise be dead air without ever
 * competing with the live bid/timer for space while someone's on the clock.
 */
export function BroadcastAuctionView({
  initialState,
  sponsors,
}: {
  initialState: AuctionState;
  sponsors: Sponsor[];
}) {
  const { state, connected, lastSale } = useAuctionSocket(initialState.id, initialState);
  const onClock = state.players.find((p) => p.status === "IN_BIDDING");
  const photoSize = usePhotoSize();

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-neutral-950 text-black dark:text-white">
      <SaleAnnouncement sale={lastSale} />

      <header className="shrink-0 flex items-center justify-between gap-3 px-6 py-3">
        <div>
          <p className="text-sm font-medium">{state.name}</p>
          <p className="text-xs text-black/50 dark:text-white/50">{state.tournamentName}</p>
        </div>
        <Badge variant={connected ? "success" : "warning"}>
          {connected ? "Live" : "Connecting…"}
        </Badge>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden flex items-start justify-center px-6 pt-2">
        {onClock ? (
          <BroadcastOnClockCard
            player={onClock}
            template={state.onClockTemplate}
            visibleFields={state.onClockVisibleFields}
            photoWidth={photoSize.width}
            photoHeight={photoSize.height}
            totalSeconds={state.lotTimerSeconds}
          />
        ) : (
          <div className="self-stretch w-full max-w-4xl h-full flex flex-col items-center gap-3 pb-3">
            <p className="text-2xl font-semibold text-center shrink-0">
              {state.status === "COMPLETED"
                ? "Auction complete — thanks for watching"
                : "Waiting for the next player…"}
            </p>
            <div className="flex-1 min-h-0 w-full overflow-y-auto">
              <SoldTicker players={state.players} teams={state.teams} />
            </div>
          </div>
        )}
      </main>

      <footer className="shrink-0 px-6 pb-3">
        <SponsorRibbon sponsors={sponsors} />
      </footer>
    </div>
  );
}
