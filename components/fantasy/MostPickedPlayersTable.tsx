"use client";

import { useState } from "react";
import { card, tabsTrack, tabItem } from "@/lib/ui";

export type MostPickedCategory = {
  categoryId: string;
  categoryName: string;
  players: { playerId: string; playerName: string; position: string | null; teamCount: number }[];
};

/** "Who's popular" leaderboard — the top picked players per auction
 * category, shared between the admin overview and the viewer/manager
 * read-only standings view. */
export function MostPickedPlayersTable({ categories }: { categories: MostPickedCategory[] }) {
  const [activeId, setActiveId] = useState(categories[0]?.categoryId);

  if (categories.length === 0) return null;
  const active = categories.find((c) => c.categoryId === activeId) ?? categories[0];

  return (
    <details className={card}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        Most picked players
      </summary>
      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className={tabsTrack}>
          {categories.map((c) => (
            <button
              key={c.categoryId}
              type="button"
              onClick={() => setActiveId(c.categoryId)}
              className={tabItem(c.categoryId === active.categoryId)}
            >
              {c.categoryName}
            </button>
          ))}
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pr-2 w-8">#</th>
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-2 text-right">Teams</th>
            </tr>
          </thead>
          <tbody>
            {active.players.map((p, i) => (
              <tr key={p.playerId} className="border-b border-black/5 dark:border-white/5 last:border-0">
                <td className="py-2 pr-2 text-black/50 dark:text-white/50">{i + 1}</td>
                <td className="py-2 pr-4">
                  {p.playerName}
                  {p.position && (
                    <span className="text-black/50 dark:text-white/50"> &middot; {p.position}</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right font-medium">{p.teamCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
