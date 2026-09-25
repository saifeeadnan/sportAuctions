"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStatsSettingsAction } from "@/lib/actions/tournamentStats.actions";
import { MY_STATS_LANDING, MY_STATS_TAB } from "@/lib/statsPublish";
import { buttonPrimary, buttonSecondary, card, inputClass, selectClass } from "@/lib/ui";

type Row = { name: string; label: string; hidden: string[]; headings: string[] };

/**
 * How an upload is presented: the order of its tabs, what each is called, which
 * columns are left out, and which tab the page opens on. What's chosen here is
 * what the preview below shows and what visitors get — hidden columns are cut on
 * the server, so the public page never receives them. The uploaded file itself
 * is unchanged.
 */
export function StatsSettingsPanel({
  leagueId,
  uploadId,
  landingTab,
  hasMyStats,
  sheets,
}: {
  leagueId: string;
  uploadId: string;
  /** A sheet's own name, "@my-stats", or null for the first tab. */
  landingTab: string | null;
  /** Whether the upload has a My stats tab (some sheet lists players). */
  hasMyStats: boolean;
  sheets: { name: string; label: string | null; hiddenColumns: string[]; headings: string[] }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    sheets.map((s) => ({ name: s.name, label: s.label ?? "", hidden: s.hiddenColumns, headings: s.headings }))
  );
  const [landing, setLanding] = useState<string>(landingTab ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const change = (name: string, patch: Partial<Row>) => {
    setMessage(null);
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, ...patch } : r)));
  };

  function move(index: number, by: -1 | 1) {
    setMessage(null);
    setRows((prev) => {
      const next = [...prev];
      const target = index + by;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleHidden(row: Row, heading: string) {
    const has = row.hidden.some((h) => h.toLowerCase() === heading.toLowerCase());
    change(row.name, { hidden: has ? row.hidden.filter((h) => h.toLowerCase() !== heading.toLowerCase()) : [...row.hidden, heading] });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await updateStatsSettingsAction(leagueId, uploadId, {
      sheets: rows.map((r) => ({ name: r.name, label: r.label.trim() || null, hiddenColumns: r.hidden })),
      landingTab: landing === "" ? null : landing,
    });
    setSaving(false);
    if (result.error) {
      setMessage({ ok: false, text: result.error });
      return;
    }
    setMessage({ ok: true, text: "Saved" });
    router.refresh();
  }

  return (
    <details className={card}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">Tabs and columns</summary>
      <div className="px-4 pb-4 flex flex-col gap-4">
        <p className="text-xs text-black/60 dark:text-white/60 max-w-3xl">
          Rearrange and rename the tabs, choose the one the page opens on, and hide columns you don&apos;t want visitors to see. Hidden columns are
          removed before the page is sent, so they never reach the public page; the file you uploaded is unchanged.
        </p>

        <label className="flex flex-col gap-1 text-sm max-w-xs">
          Page opens on
          <select value={landing} onChange={(e) => { setLanding(e.target.value); setMessage(null); }} className={selectClass}>
            <option value="">The first tab</option>
            {rows.map((r) => (
              <option key={r.name} value={r.name}>
                {r.label.trim() || r.name}
              </option>
            ))}
            {hasMyStats && <option value={MY_STATS_LANDING}>{MY_STATS_TAB}</option>}
          </select>
        </label>

        <ul className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <li key={row.name} className="rounded-lg border border-black/10 dark:border-white/10 p-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${row.label.trim() || row.name} earlier`}
                    className={`${buttonSecondary} px-2 py-1 text-xs`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1}
                    aria-label={`Move ${row.label.trim() || row.name} later`}
                    className={`${buttonSecondary} px-2 py-1 text-xs`}
                  >
                    ↓
                  </button>
                </span>
                <input
                  type="text"
                  value={row.label}
                  maxLength={60}
                  onChange={(e) => change(row.name, { label: e.target.value })}
                  placeholder={row.name}
                  aria-label={`Tab name for ${row.name}`}
                  className={`${inputClass} w-64 max-w-full`}
                />
                {row.label.trim() && row.label.trim() !== row.name && (
                  <span className="text-xs text-black/50 dark:text-white/50">sheet: {row.name}</span>
                )}
              </div>
              {row.headings.length > 0 && (
                <details>
                  <summary className="cursor-pointer select-none text-xs underline underline-offset-2">
                    Columns{row.hidden.length > 0 ? ` (${row.hidden.length} hidden)` : ""}
                  </summary>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {row.headings.map((heading) => (
                      <li key={heading}>
                        <label className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={!row.hidden.some((h) => h.toLowerCase() === heading.toLowerCase())}
                            onChange={() => toggleHidden(row, heading)}
                          />
                          {heading}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">Tick the columns to show. A heading used by several tables is hidden in all of them.</p>
                </details>
              )}
            </li>
          ))}
          {hasMyStats && (
            <li className="rounded-lg border border-dashed border-black/15 dark:border-white/15 p-3 text-sm text-black/60 dark:text-white/60">
              <span className="font-medium text-black dark:text-white">{MY_STATS_TAB}</span> — the player search always comes last.
            </li>
          )}
        </ul>

        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving} className={buttonPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
          {message && (
            <span className={`text-sm ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{message.text}</span>
          )}
        </div>
      </div>
    </details>
  );
}
