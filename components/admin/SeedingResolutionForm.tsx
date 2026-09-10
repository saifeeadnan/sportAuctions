"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalizeSeedingAction } from "@/lib/actions/playerSeeding.actions";
import { buttonPrimary, card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export type ResolutionRow = {
  playerId: string;
  name: string;
  position: string | null;
  photoUrl: string | null;
  avgSeed: number | null;
  ratingCount: number;
  tieGroup: number | null;
  currentSeed: number | null;
};

export function SeedingResolutionForm({
  rosterId,
  rows,
  isFinalized,
}: {
  rosterId: string;
  /** Already in suggested order (lower avgSeed first, unrated last). */
  rows: ResolutionRow[];
  isFinalized: boolean;
}) {
  const router = useRouter();
  const byId = new Map(rows.map((r) => [r.playerId, r]));
  const [order, setOrder] = useState<string[]>(rows.map((r) => r.playerId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleFinalize() {
    setLoading(true);
    setError(null);
    const result = await finalizeSeedingAction(rosterId, order);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">This roster has no players yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pl-4 pr-4">Seed</th>
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-4 text-right">Avg seed</th>
              <th className="py-2 pr-4 text-right"># ratings</th>
              <th className="py-2 pr-4 text-right">Current seed</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {order.map((playerId, i) => {
              const row = byId.get(playerId)!;
              return (
                <tr
                  key={playerId}
                  className={`border-b border-black/5 dark:border-white/5 last:border-0 ${
                    row.tieGroup != null ? "bg-amber-500/5" : ""
                  }`}
                >
                  <td className="py-2 pl-4 pr-4 font-medium">{i + 1}</td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      {row.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.photoUrl}
                          alt={row.name}
                          className="h-7 w-7 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span className="h-7 w-7 rounded-full bg-black/5 dark:bg-white/10 shrink-0" />
                      )}
                      <span>
                        {row.name}
                        {row.position && (
                          <span className="text-black/50 dark:text-white/50"> ({row.position})</span>
                        )}
                      </span>
                      {row.tieGroup != null && <Badge variant="warning">Tie</Badge>}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right">{row.avgSeed ?? "—"}</td>
                  <td className="py-2 pr-4 text-right">{row.ratingCount}</td>
                  <td className="py-2 pr-4 text-right text-black/60 dark:text-white/60">
                    {row.currentSeed ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="px-1.5 py-0.5 text-xs rounded border border-black/15 dark:border-white/15 disabled:opacity-30 hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
                        aria-label={`Move ${row.name} up`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === order.length - 1}
                        className="px-1.5 py-0.5 text-xs rounded border border-black/15 dark:border-white/15 disabled:opacity-30 hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
                        aria-label={`Move ${row.name} down`}
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isFinalized && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          This roster&apos;s seeding has already been published. Finalizing again overwrites the current
          published seeds.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="button" disabled={loading} onClick={handleFinalize} className={`${buttonPrimary} self-start`}>
          {loading ? "Finalizing…" : isFinalized ? "Re-finalize seeding" : "Finalize seeding"}
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
