"use client";

import { useEffect, useState } from "react";
import { card, buttonPrimary } from "@/lib/ui";
import { type SponsorTier } from "@/lib/sponsorTiers";

type Sponsor = {
  id: string;
  name: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  tier: SponsorTier;
};

const AUTO_DISMISS_MS = 6000;

// Literal lookup — see the same note in SponsorRibbon.tsx.
const TIER_LOGO_SIZE: Record<SponsorTier, string> = {
  TITLE: "h-24 w-24",
  MARQUEE: "h-20 w-20",
  COMMUNITY: "h-16 w-16", // unchanged — today's size
};

/** A one-time "thank you" greeting for a tournament's sponsors, shown the
 * first time a Viewer or Team Manager lands on an auction/fantasy page each
 * browser session — a louder moment than the quiet `SponsorRibbon` footer
 * strip already on these pages. Gated entirely client-side (starts hidden,
 * so it never flashes during SSR) and scoped per tournament, so a different
 * tournament's pages still get their own greeting this session. */
export function SponsorSplash({
  tournamentId,
  tournamentName,
  sponsors,
}: {
  tournamentId: string;
  tournamentName: string;
  sponsors: Sponsor[];
}) {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (sponsors.length === 0) return;
    const key = `sponsorSplashSeen:${tournamentId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  useEffect(() => {
    if (!visible) {
      setEntered(false);
      return;
    }
    // A tick after mount, so the opacity transition below actually animates
    // in instead of starting already at its end state.
    const raf = requestAnimationFrame(() => setEntered(true));
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Thank you to our sponsors"
      onClick={() => setVisible(false)}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity duration-300 motion-reduce:transition-none ${
        entered ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className={`${card} max-w-lg w-full p-6 flex flex-col items-center gap-4 text-center`}>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold">Thank you to our sponsors</p>
          <p className="text-sm text-black/60 dark:text-white/60">{tournamentName}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full">
          {sponsors.map((sponsor) => (
            <div key={sponsor.id} className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sponsor.logoUrl ?? `/api/tournament-sponsors/${sponsor.id}`}
                alt={sponsor.name}
                className={`${TIER_LOGO_SIZE[sponsor.tier]} rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1`}
              />
              <span className="text-xs text-center max-w-full truncate" title={sponsor.name}>
                {sponsor.name}
              </span>
            </div>
          ))}
        </div>
        <button type="button" className={buttonPrimary} onClick={() => setVisible(false)}>
          Continue
        </button>
      </div>
    </div>
  );
}
