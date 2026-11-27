"use client";

import { useMemo, useState } from "react";
import { card, inputClass, selectClass } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export type AllRostersPlayerDisplay = {
  playerId: string;
  playerName: string;
  categoryName: string;
  price: number;
  valueScore: number | null;
  soldAt: string;
  soldVia: string | null;
};

export type AllRostersTeamDisplay = {
  teamId: string;
  teamName: string;
  isSelf: boolean;
  budgetRemaining: number;
  teamStrength: number;
  slotsFilled: number;
  slotsTotal: number;
  players: AllRostersPlayerDisplay[];
};

type Row = AllRostersPlayerDisplay & { teamName: string; isSelf: boolean; soldOrder: number | null };

type SortKey = "team" | "player" | "category" | "price" | "value" | "sold";

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`py-2 pr-4 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-black dark:hover:text-white ${
          active ? "text-black dark:text-white font-medium" : "text-black/60 dark:text-white/60"
        }`}
      >
        {label}
        {active && <span className="text-xs">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

/**
 * Every sold player across every team, as one flat, sortable, searchable
 * table — supersedes using RivalRostersPanel's per-team accordions for this
 * tab (that component stays as-is for Simulate's per-run detail, a quick
 * glance rather than deep cross-team browsing). A dedicated team-by-team
 * breakdown is still one click away via sorting by Team.
 */
export function AllRostersTable({ rosters }: { rosters: AllRostersTeamDisplay[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [showRetained, setShowRetained] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("team");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const allRows: Row[] = useMemo(() => {
    // Sold order is global across the whole auction, independent of
    // whatever filter/search/sort is currently applied -- rows with no real
    // timestamp (shouldn't happen for a real sale, but defensively) sort
    // last rather than first, so they never masquerade as "sold earliest."
    const flat = rosters.flatMap((r) =>
      r.players.map((p) => ({ ...p, teamName: r.teamName, isSelf: r.isSelf }))
    );
    const chronological = [...flat].sort((a, b) => {
      if (a.soldAt === "" && b.soldAt === "") return 0;
      if (a.soldAt === "") return 1;
      if (b.soldAt === "") return -1;
      return a.soldAt.localeCompare(b.soldAt);
    });
    const orderByPlayerId = new Map(chronological.map((p, i) => [p.playerId, p.soldAt === "" ? null : i + 1]));
    return flat.map((p) => ({ ...p, soldOrder: orderByPlayerId.get(p.playerId) ?? null }));
  }, [rosters]);

  const categories = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.categoryName))).sort(),
    [allRows]
  );

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = allRows.filter((r) => {
      if (!showRetained && r.soldVia !== "LIVE_BID") return false;
      if (categoryFilter !== "ALL" && r.categoryName !== categoryFilter) return false;
      if (term !== "" && !r.playerName.toLowerCase().includes(term)) return false;
      return true;
    });

    const dirMul = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "team": {
          // Self always leads regardless of direction -- flipping direction
          // re-sorts everyone else, not the one row that's always "you."
          if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
          const teamCmp = a.teamName.localeCompare(b.teamName) * dirMul;
          return teamCmp !== 0 ? teamCmp : (b.valueScore ?? -Infinity) - (a.valueScore ?? -Infinity);
        }
        case "player":
          return a.playerName.localeCompare(b.playerName) * dirMul;
        case "category": {
          const catCmp = a.categoryName.localeCompare(b.categoryName) * dirMul;
          return catCmp !== 0 ? catCmp : (b.valueScore ?? -Infinity) - (a.valueScore ?? -Infinity);
        }
        case "price":
          return (a.price - b.price) * dirMul;
        case "value":
          return ((a.valueScore ?? -Infinity) - (b.valueScore ?? -Infinity)) * dirMul;
        case "sold":
          return ((a.soldOrder ?? Infinity) - (b.soldOrder ?? Infinity)) * dirMul;
        default:
          return 0;
      }
    });
    return rows;
  }, [allRows, search, categoryFilter, showRetained, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (allRows.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">No players sold yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player…"
          className={`${inputClass} w-48 text-sm`}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={`${selectClass} text-sm`}
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-black/70 dark:text-white/70">
          <input
            type="checkbox"
            checked={showRetained}
            onChange={(e) => setShowRetained(e.target.checked)}
            className="h-4 w-4 accent-neutral-700 dark:accent-neutral-300"
          />
          Show retained players
        </label>
        <span className="text-xs text-black/50 dark:text-white/50 ml-auto">
          {visibleRows.length} of {allRows.length} players
        </span>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <SortHeader label="Team" active={sortKey === "team"} dir={sortDir} onClick={() => toggleSort("team")} />
              <SortHeader label="Player" active={sortKey === "player"} dir={sortDir} onClick={() => toggleSort("player")} />
              <SortHeader label="Category" active={sortKey === "category"} dir={sortDir} onClick={() => toggleSort("category")} />
              <SortHeader label="Price" active={sortKey === "price"} dir={sortDir} onClick={() => toggleSort("price")} align="right" />
              <SortHeader label="Value" active={sortKey === "value"} dir={sortDir} onClick={() => toggleSort("value")} align="right" />
              <SortHeader label="Sold #" active={sortKey === "sold"} dir={sortDir} onClick={() => toggleSort("sold")} align="right" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.playerId} className="border-b border-black/5 dark:border-white/5 last:border-0">
                <td className="py-2 pr-4">
                  <span className="inline-flex items-center gap-1.5">
                    {r.teamName}
                    {r.isSelf && <Badge variant="info">You</Badge>}
                  </span>
                </td>
                <td className="py-2 pr-4">{r.playerName}</td>
                <td className="py-2 pr-4">{r.categoryName}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{r.price.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {r.valueScore != null ? r.valueScore.toFixed(1) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                  {r.soldOrder ?? "—"}
                  {r.soldVia != null && r.soldVia !== "LIVE_BID" && (
                    <span className="text-black/40 dark:text-white/40"> (retained)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
