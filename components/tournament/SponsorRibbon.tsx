"use client";

import { useEffect, useState } from "react";
import { SponsorLink } from "@/components/tournament/SponsorLink";

type Sponsor = { id: string; name: string; websiteUrl: string | null; logoUrl: string | null };

const ROTATE_INTERVAL_MS = 4500;
const SHUFFLE_SEED_KEY = "sponsorRibbonShuffleSeed";

// Deterministic PRNG (mulberry32) — the same seed always produces the same
// shuffle, so persisting one seed per browser session (not reshuffling on
// every render) is enough to keep the order stable across page navigations.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getSessionShuffleSeed(): number {
  const stored = sessionStorage.getItem(SHUFFLE_SEED_KEY);
  if (stored) return Number(stored);
  const seed = Math.floor(Math.random() * 2 ** 31);
  sessionStorage.setItem(SHUFFLE_SEED_KEY, String(seed));
  return seed;
}

/** A horizontal strip of sponsor logos for the bottom of a page. A gentle
 * glow/scale spotlight rotates through sponsors one at a time so the ribbon
 * catches peripheral attention on a page where people are mostly watching
 * the bid clock — slow and quiet rather than a loud/jumpy effect that would
 * compete with the actual bidding UI for attention. The display order is
 * also randomized once per browser session (not per render) so no sponsor
 * structurally always leads, while staying stable as you navigate around. */
export function SponsorRibbon({ sponsors }: { sponsors: Sponsor[] }) {
  const [featured, setFeatured] = useState(0);
  // Starts in the server-rendered order so hydration matches exactly, then
  // reorders once on the client via the session's shuffle seed.
  const [orderedSponsors, setOrderedSponsors] = useState(sponsors);

  useEffect(() => {
    setOrderedSponsors(shuffle(sponsors, getSessionShuffleSeed()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sponsors]);

  useEffect(() => {
    if (orderedSponsors.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = setInterval(() => {
      setFeatured((i) => (i + 1) % orderedSponsors.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [orderedSponsors.length]);

  if (sponsors.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-black/[0.08] dark:border-white/10">
      <p className="text-xs text-black/50 dark:text-white/50 mb-2">Sponsors</p>
      <div className="flex flex-nowrap items-center gap-4 overflow-x-auto pb-2">
        {orderedSponsors.map((sponsor, i) => {
          const isFeatured = i === featured;
          const logo = (
            <div className="group flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sponsor.logoUrl ?? `/api/tournament-sponsors/${sponsor.id}`}
                alt={sponsor.name}
                title={sponsor.name}
                className={`h-28 w-28 rounded object-contain bg-white dark:bg-white/10 border p-2 transition-all duration-700 ${
                  isFeatured
                    ? "border-indigo-400 dark:border-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.25)] scale-[1.08]"
                    : "border-black/10 dark:border-white/10"
                }`}
              />
              <span
                className={`text-xs text-center max-w-28 truncate transition-opacity duration-300 ${
                  isFeatured ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {sponsor.name}
              </span>
            </div>
          );
          return sponsor.websiteUrl ? (
            <SponsorLink
              key={sponsor.id}
              sponsorId={sponsor.id}
              websiteUrl={sponsor.websiteUrl}
              className="shrink-0"
            >
              {logo}
            </SponsorLink>
          ) : (
            <span key={sponsor.id} className="shrink-0">
              {logo}
            </span>
          );
        })}
      </div>
    </div>
  );
}
