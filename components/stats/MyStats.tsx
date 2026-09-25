"use client";

import { useEffect, useMemo, useState } from "react";
import { card, buttonSecondary } from "@/lib/ui";
import { looksNumeric } from "@/lib/statsSheetGrid";
import {
  compareStats,
  findPlayers,
  groupSections,
  playerStats,
  type CompareSection,
  type PlayerIndex,
  type PlayerSection,
} from "@/lib/statsPlayerView";
import { writeUrl } from "@/components/stats/urlState";

const MAX_SUGGESTIONS = 12;
const same = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase().replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Choosing a player
// ---------------------------------------------------------------------------

/** A search box's worth of state: what is typed, who matches, and who is chosen. */
function usePlayerPick(index: PlayerIndex, initial: string | null, onChange: () => void) {
  const start = initial ? (findPlayers(index, initial).find((n) => same(n, initial)) ?? null) : null;
  const [query, setQuery] = useState(start ?? "");
  const [picked, setPicked] = useState<string | null>(start);
  const matches = useMemo(() => findPlayers(index, query), [index, query]);
  // who to show: the name clicked, else the only match, else the one typed out in full
  const shown = picked ?? (matches.length === 1 ? matches[0] : (matches.find((m) => same(m, query)) ?? null));
  return {
    query,
    matches,
    shown,
    type(text: string) {
      onChange();
      setQuery(text);
      setPicked(null);
    },
    pick(name: string) {
      onChange();
      setPicked(name);
    },
  };
}

type Pick = ReturnType<typeof usePlayerPick>;

function PlayerPicker({ id, label, pick, players }: { id: string; label: string; pick: Pick; players: number }) {
  const typed = pick.query.trim() !== "";
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex flex-col gap-1 max-w-md">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <input
          id={id}
          type="search"
          autoComplete="off"
          value={pick.query}
          onChange={(e) => pick.type(e.target.value)}
          placeholder="Type a name"
          className="rounded-lg border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60"
        />
      </div>

      {!typed && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Type a name to see that player&apos;s numbers from every sheet, laid out down the page. {players.toLocaleString("en-US")} players.
        </p>
      )}
      {typed && pick.matches.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">No player found matching “{pick.query.trim()}”.</p>
      )}

      {pick.matches.length > 1 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-black/50 dark:text-white/50">
            {pick.matches.length} players match{pick.shown ? "" : " — pick one"}:
          </p>
          <ul className="flex flex-wrap gap-2">
            {pick.matches.slice(0, MAX_SUGGESTIONS).map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => pick.pick(name)}
                  aria-pressed={pick.shown === name}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    pick.shown === name
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                      : "border-black/15 dark:border-white/15 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  }`}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
          {pick.matches.length > MAX_SUGGESTIONS && (
            <p className="text-xs text-black/50 dark:text-white/50">
              and {pick.matches.length - MAX_SUGGESTIONS} more — type more of the name to narrow it down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

const cellClass = "px-3 py-1.5 text-right align-top break-words [overflow-wrap:anywhere]";
const rowClass = "border-b border-black/5 dark:border-white/5 last:border-0 even:bg-black/[0.045] dark:even:bg-white/[0.065]";
const headingOf = (section: { sheet: string; title: string | null }) => (section.title ? `${section.sheet} — ${section.title}` : section.sheet);

/** One table of a player's data, turned on its side: a row per field, a column per season (or lone value). */
function TransposedTable({ section }: { section: PlayerSection }) {
  const labelShare = section.columns.length <= 1 ? 50 : section.columns.length <= 3 ? 34 : 24;
  const valueShare = (100 - labelShare) / section.columns.length;

  return (
    <section className="flex flex-col gap-2 min-w-0">
      <h3 className="text-sm font-semibold">{headingOf(section)}</h3>
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
                <th key={c} scope="col" className={`${cellClass} py-2 font-semibold align-bottom`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.fields.map((field) => (
              <tr key={field.label} className={rowClass}>
                <th scope="row" className="px-3 py-1.5 text-left font-medium align-top break-words [overflow-wrap:anywhere]">
                  {field.label}
                </th>
                {field.values.map((value, c) => (
                  <td key={c} className={`${cellClass} ${looksNumeric(value) ? "tabular-nums" : ""}`}>
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

/** Two players' data for one table, side by side: the players are the top headings, their seasons (or lone values) the columns under them. */
function CompareTable({ section }: { section: CompareSection }) {
  const labelShare = section.columns.length <= 2 ? 40 : section.columns.length <= 3 ? 32 : 20;
  const valueShare = (100 - labelShare) / section.columns.length;
  const players = section.columns.reduce<{ player: string; span: number }[]>((groups, col) => {
    const last = groups[groups.length - 1];
    if (last && last.player === col.player) last.span += 1;
    else groups.push({ player: col.player, span: 1 });
    return groups;
  }, []);
  // "Value" (one lone figure) and "—" (not in this table) say nothing under a player's name
  const showLabels = section.columns.some((c) => c.label !== "Value" && c.label !== "—");

  return (
    <section className="flex flex-col gap-2 min-w-0">
      <h3 className="text-sm font-semibold">{headingOf(section)}</h3>
      <div className={`${card} overflow-x-hidden`}>
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: `${labelShare}%` }} />
            {section.columns.map((_, c) => (
              <col key={c} style={{ width: `${valueShare}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className={showLabels ? "" : "border-b border-black/10 dark:border-white/10"}>
              <td />
              {players.map((group, i) => (
                <th
                  key={i}
                  scope="colgroup"
                  colSpan={group.span}
                  className={`${cellClass} py-2 font-semibold align-bottom ${i > 0 ? "border-l border-black/10 dark:border-white/10" : ""}`}
                >
                  {group.player}
                </th>
              ))}
            </tr>
            {showLabels && (
              <tr className="border-b border-black/10 dark:border-white/10">
                <td />
                {section.columns.map((col, c) => (
                  <th
                    key={c}
                    scope="col"
                    className={`${cellClass} pt-0 pb-2 text-xs font-medium text-black/60 dark:text-white/60 ${
                      c > 0 && section.columns[c - 1].player !== col.player ? "border-l border-black/10 dark:border-white/10" : ""
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {section.fields.map((field) => (
              <tr key={field.label} className={rowClass}>
                <th scope="row" className="px-3 py-1.5 text-left font-medium align-top break-words [overflow-wrap:anywhere]">
                  {field.label}
                </th>
                {field.values.map((value, c) => (
                  <td
                    key={c}
                    className={`${cellClass} ${looksNumeric(value) ? "tabular-nums" : ""} ${
                      c > 0 && section.columns[c - 1].player !== section.columns[c].player ? "border-l border-black/10 dark:border-white/10" : ""
                    }`}
                  >
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

/** Runs of narrow tables flow into a responsive grid; wide ones take the full width. Order is kept. */
function Sections<T extends { columns: unknown[] }>({ sections, render }: { sections: T[]; render: (section: T) => React.ReactNode }) {
  return (
    <>
      {groupSections(sections).map((group, g) => (
        <div key={g} className={group.compact ? "grid gap-6 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 items-start" : ""}>
          {group.sections.map((section) => render(section))}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

function ShareActions({ sharePath, first, second }: { sharePath: string; first: string; second: string | null }) {
  const [copied, setCopied] = useState(false);
  const query = `?player=${encodeURIComponent(first)}${second ? `&vs=${encodeURIComponent(second)}` : ""}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${sharePath}${query}#${encodeURIComponent("My stats")}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the link is still in the address bar.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={copy} className={`${buttonSecondary} px-3 py-1.5 text-xs`}>
        {copied ? "Copied!" : "Copy link"}
      </button>
      {!second && (
        <a
          href={`${sharePath}/card?player=${encodeURIComponent(first)}&download=1`}
          className={`${buttonSecondary} px-3 py-1.5 text-xs`}
          title="A picture of these stats to send or post"
        >
          Download image
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

/**
 * "My stats": type a name and see that player's rows from every sheet, each
 * table turned on its side so all of a player's numbers read down the page.
 * "Compare" adds a second player beside the first. The chosen players live in
 * the URL (?player=…&vs=…), so the link — Copy link — opens straight on them.
 */
export function MyStats({
  index,
  sharePath,
  initialPlayer,
  initialCompare,
}: {
  index: PlayerIndex;
  /** The public page's own path (/stats/<token>), for links and the image; null where there is no public page to point at. */
  sharePath: string | null;
  initialPlayer: string | null;
  initialCompare: string | null;
}) {
  // The address bar is only rewritten once the person has chosen something: a page that
  // merely opened on a player link must not touch the link it was opened with.
  const [touched, setTouched] = useState(false);
  const first = usePlayerPick(index, initialPlayer, () => setTouched(true));
  const second = usePlayerPick(index, initialCompare, () => setTouched(true));
  const [comparing, setComparing] = useState(initialCompare !== null);

  const nameA = first.shown;
  const nameB = comparing ? second.shown : null;

  // keep the address bar pointing at who is on screen
  useEffect(() => {
    if (touched) writeUrl({ params: { player: nameA, vs: nameB } });
  }, [touched, nameA, nameB]);

  const single = useMemo(() => (nameA && !nameB ? playerStats(index, nameA) : nameB && !nameA ? playerStats(index, nameB) : []), [index, nameA, nameB]);
  const compared = useMemo(() => (nameA && nameB ? compareStats(index, nameA, nameB) : []), [index, nameA, nameB]);
  const lone = nameA && !nameB ? nameA : nameB && !nameA ? nameB : null;
  const players = index.names.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 items-start">
        <PlayerPicker id="my-stats-search" label="Find a player" pick={first} players={players} />
        {comparing && <PlayerPicker id="my-stats-compare" label="Compare with" pick={second} players={players} />}
      </div>

      <div>
        <button
          type="button"
          onClick={() => {
            setTouched(true);
            setComparing((on) => !on);
          }}
          aria-pressed={comparing}
          className={`${buttonSecondary} px-3 py-1.5 text-xs`}
        >
          {comparing ? "Stop comparing" : "Compare with another player"}
        </button>
      </div>

      {lone && (
        <div className="flex flex-col gap-6" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{lone}</h2>
            {sharePath && <ShareActions sharePath={sharePath} first={lone} second={null} />}
          </div>
          {comparing && !nameB && <p className="text-sm text-black/60 dark:text-white/60">Pick a second player to compare with.</p>}
          {single.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">Nothing to show for this player.</p>
          ) : (
            <Sections sections={single} render={(section) => <TransposedTable key={`${section.table}`} section={section} />} />
          )}
        </div>
      )}

      {nameA && nameB && (
        <div className="flex flex-col gap-6" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {nameA} <span className="text-black/40 dark:text-white/40 font-normal">vs</span> {nameB}
            </h2>
            {sharePath && <ShareActions sharePath={sharePath} first={nameA} second={nameB} />}
          </div>
          {compared.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">Neither player has anything to show.</p>
          ) : (
            <Sections sections={compared} render={(section) => <CompareTable key={`${section.table}`} section={section} />} />
          )}
        </div>
      )}
    </div>
  );
}
