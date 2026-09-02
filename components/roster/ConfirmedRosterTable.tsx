"use client";

import { useState } from "react";
import { formatSoldVia } from "@/lib/format";
import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export type ConfirmedRosterPlayer = {
  id: string;
  playerName: string;
  photoUrl?: string | null;
  categoryName: string;
  soldPrice: string | null;
  soldVia: string | null;
  isCaptain?: boolean;
};

type SortField = "playerName" | "categoryName" | "soldPrice" | "soldVia";
type SortDir = "asc" | "desc";

const COLUMNS: { field: SortField; label: string }[] = [
  { field: "playerName", label: "Player" },
  { field: "categoryName", label: "Category" },
  { field: "soldPrice", label: "Price" },
  { field: "soldVia", label: "Via" },
];

function compareValues(a: ConfirmedRosterPlayer, b: ConfirmedRosterPlayer, field: SortField): number {
  if (field === "soldPrice") {
    const av = a.soldPrice != null ? Number(a.soldPrice) : -Infinity;
    const bv = b.soldPrice != null ? Number(b.soldPrice) : -Infinity;
    return av - bv;
  }
  const av = (a[field] ?? "").toLowerCase();
  const bv = (b[field] ?? "").toLowerCase();
  return av.localeCompare(bv);
}

export function ConfirmedRosterTable({
  players,
  photoSize = 34,
}: {
  players: ConfirmedRosterPlayer[];
  /** Player photo diameter in px — 34 (default) is 20% larger than the
   * original 28px (h-7/w-7) this table used before. */
  photoSize?: number;
}) {
  const [sortField, setSortField] = useState<SortField>("playerName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  if (players.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No players confirmed yet.</p>;
  }

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sorted = [...players].sort((a, b) => {
    const cmp = compareValues(a, b, sortField);
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            {COLUMNS.map((col, i) => (
              <th key={col.field} className={i === 0 ? "py-2 pl-4 pr-4" : "py-2 pr-4"}>
                <button
                  type="button"
                  onClick={() => handleSort(col.field)}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {col.label}
                  {sortField === col.field && (
                    <span className="text-black/50 dark:text-white/50">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
              <td className="py-2 pl-4 pr-4">
                <div className="flex items-center gap-2">
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photoUrl}
                      alt={p.playerName}
                      className="rounded-full object-cover shrink-0"
                      style={{ height: photoSize, width: photoSize }}
                    />
                  ) : (
                    <span
                      className="rounded-full bg-black/5 dark:bg-white/10 shrink-0"
                      style={{ height: photoSize, width: photoSize }}
                    />
                  )}
                  {p.playerName}
                  {p.isCaptain && <Badge variant="warning">Captain</Badge>}
                </div>
              </td>
              <td className="py-2 pr-4">{p.categoryName}</td>
              <td className="py-2 pr-4">{p.soldPrice ?? "—"}</td>
              <td className="py-2 pr-4">{formatSoldVia(p.soldVia)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
