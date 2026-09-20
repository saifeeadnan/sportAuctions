"use client";

import { useState } from "react";
import { card, tabsTrack, tabItem } from "@/lib/ui";

export type PlayerPoolPlayer = {
  id: string;
  playerName: string;
  photoUrl?: string | null;
  categoryName: string;
};

/** Read-only preview of an auction's player pool, grouped into one tab per
 * category — used before bidding has actually started, where a sold
 * price/via column has nothing meaningful to show yet. */
export function PlayerPoolPreview({ players }: { players: PlayerPoolPlayer[] }) {
  const categories = Array.from(new Set(players.map((p) => p.categoryName))).sort((a, b) =>
    a.localeCompare(b)
  );
  const [activeCategory, setActiveCategory] = useState(categories[0] ?? "");

  if (players.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No players in the pool yet.</p>;
  }

  const shown = players.filter((p) => p.categoryName === activeCategory);

  return (
    <div className="flex flex-col gap-3">
      <div className={tabsTrack}>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={tabItem(cat === activeCategory)}
          >
            {cat} ({players.filter((p) => p.categoryName === cat).length})
          </button>
        ))}
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pl-4 pr-2 w-10">#</th>
              <th className="py-2 pr-4">Player</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={p.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                <td className="py-2 pl-4 pr-2 text-black/50 dark:text-white/50">{i + 1}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photoUrl}
                        alt={p.playerName}
                        className="h-[34px] w-[34px] rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span className="h-[34px] w-[34px] rounded-full bg-black/5 dark:bg-white/10 shrink-0" />
                    )}
                    {p.playerName}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
