"use client";

import { useEffect, useRef, useState } from "react";
import type { AuctionState } from "@/lib/services/auctionState.service";
import type { SponsorTier } from "@/lib/sponsorTiers";
import { formatCountdown } from "@/lib/countdown";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { BroadcastOnClockCard } from "@/components/auction/BroadcastOnClockCard";
import { SaleAnnouncement } from "@/components/auction/SaleAnnouncement";
import { BroadcastSoldTicker } from "@/components/auction/BroadcastSoldTicker";
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

/** Tracks the actual rendered size of the element `ref` is attached to —
 * the real available box for the team-roster grid (whatever's left after
 * the header/waiting-message/footer/sponsor-ribbon around it), not a guess
 * at the OBS canvas size. A fixed-size guess is exactly what let 12 teams
 * overflow into a vertical scrollbar before: the sponsor ribbon's actual
 * height varies (zero sponsors vs several), so only measuring what's
 * genuinely left over is reliable. */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize?.[0];
      setSize(
        box
          ? { width: box.inlineSize, height: box.blockSize }
          : { width: entry.contentRect.width, height: entry.contentRect.height }
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

/** Milliseconds remaining until `targetIso`, ticking once a second —
 * `targetIso: null` means "no countdown active" and the hook just returns
 * null without starting a timer. */
function useCountdown(targetIso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [targetIso]);
  return targetIso ? new Date(targetIso).getTime() - now : null;
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
  const { state, connected, lastSale } = useAuctionSocket(initialState.id, initialState, { public: true });
  const onClock = state.players.find((p) => p.status === "IN_BIDDING");
  const photoSize = usePhotoSize();
  const tickerBox = useElementSize<HTMLDivElement>();
  const playersLeft = state.players.filter(
    (p) => p.status === "AVAILABLE" || p.status === "IN_PRE_AUCTION_POOL" || p.status === "UNSOLD"
  ).length;
  // Only meaningful before bidding actually starts — once it does, the
  // scheduled time has served its purpose regardless of whether it's set.
  const countingDown = state.status !== "BIDDING" && state.status !== "COMPLETED";
  const msUntilStart = useCountdown(countingDown ? state.scheduledStartAt : null);

  return (
    // Always dark, regardless of the viewer's OS/browser preference — an
    // OBS browser source has no theme toggle to respect, and a real
    // deployment defaulting to light (no stored preference, no dark OS
    // scheme) is exactly the reported bug. Same "wrap the root in .dark"
    // technique as app/highlights/[token], which forces dark the same way.
    <div className="dark">
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
            <div className="self-stretch w-full h-full flex flex-col items-center gap-3 pb-3">
              <div className="flex items-center justify-center gap-3 shrink-0">
                {state.hasLeagueLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/leagues/${state.leagueId}/logo`}
                    alt=""
                    className="h-32 w-32 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1 shrink-0"
                  />
                )}
                <p className="text-2xl font-semibold text-center">
                  {state.status === "COMPLETED"
                    ? "Auction complete — thanks for watching"
                    : msUntilStart != null
                      ? msUntilStart > 0
                        ? `Auction starts in ${formatCountdown(msUntilStart)}`
                        : "Starting soon…"
                      : `Waiting for the next player… (${playersLeft} left)`}
                </p>
              </div>
              <div ref={tickerBox.ref} className="flex-1 min-h-0 w-full overflow-y-auto">
                <BroadcastSoldTicker
                  players={state.players}
                  teams={state.teams}
                  availableWidth={tickerBox.size.width}
                  availableHeight={tickerBox.size.height}
                />
              </div>
            </div>
          )}
        </main>

        <footer className="shrink-0 px-6 pb-3">
          <SponsorRibbon sponsors={sponsors} />
        </footer>
      </div>
    </div>
  );
}
