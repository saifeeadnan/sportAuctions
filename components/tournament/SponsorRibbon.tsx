"use client";

import { useEffect, useState } from "react";
import { SponsorLink } from "@/components/tournament/SponsorLink";
import { SPONSOR_TIERS, type SponsorTier } from "@/lib/sponsorTiers";

type Sponsor = {
  id: string;
  name: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  tier: SponsorTier;
};

const ROTATE_INTERVAL_MS = 4500;
const SHUFFLE_SEED_KEY = "sponsorRibbonShuffleSeed";

// Literal lookup — Tailwind v4 statically scans source for class-name
// strings (see lib/categoryAccent.ts), so sizes come from a lookup object,
// never `h-${n} w-${n}` built from a variable.
const TIER_LOGO_SIZE: Record<SponsorTier, string> = {
  TITLE: "h-36 w-36",
  MARQUEE: "h-32 w-32",
  COMMUNITY: "h-28 w-28", // unchanged — today's uniform size
};
const TIER_CAPTION_WIDTH: Record<SponsorTier, string> = {
  TITLE: "max-w-36",
  MARQUEE: "max-w-32",
  COMMUNITY: "max-w-28", // unchanged
};
const TIER_ROTATION_WEIGHT: Record<SponsorTier, number> = { TITLE: 3, MARQUEE: 2, COMMUNITY: 1 };

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

// Higher tiers always lead the ribbon, but within a tier the order is still
// randomized per browser session — no single sponsor structurally always
// leads within its own tier. Each tier group gets an offset seed so the
// three groups don't shuffle from identical PRNG state.
function groupByTierThenShuffle(sponsors: Sponsor[], seed: number): Sponsor[] {
  return SPONSOR_TIERS.flatMap((tier, i) =>
    shuffle(
      sponsors.filter((s) => s.tier === tier),
      seed + i
    )
  );
}

// Higher tiers get proportionally more "featured" spotlight turns — built by
// repeating each sponsor's index per its tier weight, then shuffling so the
// extra turns land spread through the cycle rather than as one long
// consecutive glow.
function buildRotationSequence(orderedSponsors: Sponsor[], seed: number): number[] {
  const weighted: number[] = [];
  orderedSponsors.forEach((s, i) => {
    for (let n = 0; n < TIER_ROTATION_WEIGHT[s.tier]; n++) weighted.push(i);
  });
  return shuffle(weighted, seed + 100);
}

/** A horizontal strip of sponsor logos for the bottom of a page. A gentle
 * glow/scale spotlight rotates through sponsors one at a time so the ribbon
 * catches peripheral attention on a page where people are mostly watching
 * the bid clock — slow and quiet rather than a loud/jumpy effect that would
 * compete with the actual bidding UI for attention. The display order is
 * also randomized once per browser session (not per render) so no sponsor
 * structurally always leads, while staying stable as you navigate around. */
export function SponsorRibbon({ sponsors }: { sponsors: Sponsor[] }) {
  const [featuredStep, setFeaturedStep] = useState(0);
  // Starts in the server-rendered order (already tier-sorted) so hydration
  // matches exactly, then reorders once on the client via the session's
  // shuffle seed.
  const [orderedSponsors, setOrderedSponsors] = useState(sponsors);
  const [rotationSequence, setRotationSequence] = useState<number[]>(() =>
    sponsors.map((_, i) => i)
  );

  useEffect(() => {
    const seed = getSessionShuffleSeed();
    const grouped = groupByTierThenShuffle(sponsors, seed);
    setOrderedSponsors(grouped);
    setRotationSequence(buildRotationSequence(grouped, seed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sponsors]);

  useEffect(() => {
    if (rotationSequence.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = setInterval(() => {
      setFeaturedStep((step) => (step + 1) % rotationSequence.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [rotationSequence.length]);

  if (sponsors.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-black/[0.08] dark:border-white/10">
      <p className="text-xs text-black/50 dark:text-white/50 mb-2">Sponsors</p>
      <div className="flex flex-nowrap items-center gap-4 overflow-x-auto pb-2">
        {orderedSponsors.map((sponsor, i) => {
          const isFeatured = i === rotationSequence[featuredStep];
          const logo = (
            <div className="group flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sponsor.logoUrl ?? `/api/tournament-sponsors/${sponsor.id}`}
                alt={sponsor.name}
                title={sponsor.name}
                className={`${TIER_LOGO_SIZE[sponsor.tier]} rounded object-contain bg-white dark:bg-white/10 border p-2 transition-all duration-700 ${
                  isFeatured
                    ? "border-indigo-400 dark:border-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.25)] scale-[1.08]"
                    : "border-black/10 dark:border-white/10"
                }`}
              />
              <span
                className={`text-xs text-center ${TIER_CAPTION_WIDTH[sponsor.tier]} truncate transition-opacity duration-300 ${
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
