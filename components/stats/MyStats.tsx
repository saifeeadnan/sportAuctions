"use client";

import { useMemo, useState } from "react";
import { card } from "@/lib/ui";
import { looksNumeric } from "@/lib/statsSheetGrid";
import { findPlayers, groupSections, playerStats, type PlayerIndex, type PlayerSection } from "@/lib/statsPlayerView";

const MAX_SUGGESTIONS = 12;
const same = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase().replace(/\s+/g, " ").trim();

/** One table of a player's data, turned on its side: a row per field, a column per season (or lone value). */
function TransposedTable({ section }: { section: PlayerSection }) {
  const heading = section.title ? `${section.sheet} — ${section.title}` : section.sheet;
  const labelShare = section.columns.length <= 1 ? 50 : section.columns.length <= 3 ? 34 : 24;
  const valueShare = (100 - labelShare) / section.columns.length;

  return (
    <section className="flex flex-col gap-2 min-w-0">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <div className={`${card} overflow-x-hidden`}>
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: `${labelShare}%` }} />
            {section.columns.map((_, c) => (
              <col key={c} style={{ width: `${valueShare}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <td />
              {section.columns.map((label, c) => (
                <th key={c} scope="col" className="px-3 py-2 text-right font-semibold align-bottom break-words [overflow-wrap:anywhere]">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.fields.map((field) => (
              <tr key={field.label} className="border-b border-black/5 dark:border-white/5 last:border-0 even:bg-black/[0.045] dark:even:bg-white/[0.065]">
                <th scope="row" className="px-3 py-1.5 text-left font-medium align-top break-words [overflow-wrap:anywhere]">
                  {field.label}
                </th>
                {field.values.map((value, c) => (
                  <td key={c} className={`px-3 py-1.5 text-right align-top break-words [overflow-wrap:anywhere] ${looksNumeric(value) ? "tabular-nums" : ""}`}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * "My stats": type a name and see that player's rows from every sheet, each
 * table turned on its side so all of a player's numbers read down the page.
 * With several names matching, pick one; a lone or exactly-typed name shows at
 * once.
 */
export function MyStats({ index }: { index: PlayerIndex }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const matches = useMemo(() => findPlayers(index, query), [index, query]);
  // who to show: the name clicked, else the only match, else the one typed out in full
  const shown = picked ?? (matches.length === 1 ? matches[0] : (matches.find((m) => same(m, query)) ?? null));
  const sections = useMemo(() => (shown ? playerStats(index, shown) : []), [index, shown]);
  const typed = query.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 max-w-md">
        <label htmlFor="my-stats-search" className="text-sm font-medium">
          Find a player
        </label>
        <input
          id="my-stats-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
          placeholder="Type a name"
          className="rounded-lg border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60"
        />
      </div>

      {!typed && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Type a name to see that player&apos;s numbers from every sheet, laid out down the page.{" "}
          {index.names.length.toLocaleString("en-US")} players.
        </p>
      )}
      {typed && matches.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">No player found matching “{query.trim()}”.</p>
      )}

      {matches.length > 1 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-black/50 dark:text-white/50">
            {matches.length} players match{shown ? "" : " — pick one"}:
          </p>
          <ul className="flex flex-wrap gap-2">
            {matches.slice(0, MAX_SUGGESTIONS).map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => setPicked(name)}
                  aria-pressed={shown === name}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    shown === name
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                      : "border-black/15 dark:border-white/15 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  }`}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
          {matches.length > MAX_SUGGESTIONS && (
            <p className="text-xs text-black/50 dark:text-white/50">and {matches.length - MAX_SUGGESTIONS} more — type more of the name to narrow it down.</p>
          )}
        </div>
      )}

      {shown && (
        <div className="flex flex-col gap-6" aria-live="polite">
          <h2 className="text-xl font-semibold">{shown}</h2>
          {sections.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">Nothing to show for this player.</p>
          ) : (
            groupSections(sections).map((group, g) => (
              <div key={g} className={group.compact ? "grid gap-6 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 items-start" : ""}>
                {group.sections.map((section, i) => (
                  <TransposedTable key={`${section.sheet}:${section.title ?? ""}:${i}`} section={section} />
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
