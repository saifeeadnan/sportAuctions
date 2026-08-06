"use client";

import { useEffect, useState } from "react";
import { SponsorLink } from "@/components/tournament/SponsorLink";

type Sponsor = { id: string; name: string; websiteUrl: string | null };

const ROTATE_INTERVAL_MS = 4500;

/** A horizontal strip of sponsor logos for the bottom of a page — larger and
 * more prominent than SponsorRow's inline "Sponsored by" mention. A gentle
 * glow/scale spotlight rotates through sponsors one at a time so the ribbon
 * catches peripheral attention on a page where people are mostly watching
 * the bid clock — slow and quiet rather than a loud/jumpy effect that would
 * compete with the actual bidding UI for attention. */
export function SponsorRibbon({ sponsors }: { sponsors: Sponsor[] }) {
  const [featured, setFeatured] = useState(0);

  useEffect(() => {
    if (sponsors.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = setInterval(() => {
      setFeatured((i) => (i + 1) % sponsors.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sponsors.length]);

  if (sponsors.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-black/[0.08] dark:border-white/10">
      <p className="text-xs text-black/50 dark:text-white/50 mb-2">Sponsors</p>
      <div className="flex flex-nowrap items-center gap-4 overflow-x-auto pb-2">
        {sponsors.map((sponsor, i) => {
          const isFeatured = i === featured;
          const logo = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/tournament-sponsors/${sponsor.id}`}
              alt={sponsor.name}
              title={sponsor.name}
              className={`h-28 w-28 rounded object-contain bg-white dark:bg-white/10 border p-2 transition-all duration-700 ${
                isFeatured
                  ? "border-indigo-400 dark:border-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.25)] scale-[1.08]"
                  : "border-black/10 dark:border-white/10"
              }`}
            />
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
