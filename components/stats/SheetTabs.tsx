"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { StatsGrid } from "@/lib/statsUpload/schema";
import { buildPlayerIndex } from "@/lib/statsPlayerView";
import { tabItem } from "@/lib/ui";
import { SheetGrid } from "@/components/stats/SheetGrid";
import { MyStats } from "@/components/stats/MyStats";

const TAB_EVENT = "stats-sheet-tab";
const MY_STATS = "My stats";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(TAB_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(TAB_EVENT, onChange);
  };
}
const getHash = () => window.location.hash;
const getServerHash = () => "";

function decodeHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

/**
 * The sheets of a workbook as Excel-style tabs, plus a "My stats" tab when any
 * sheet lists players. The open tab lives in the URL hash (#Sheet%20name), so a
 * shared link can open on a particular tab and a refresh keeps the place. A
 * tab's content is built the first time it is opened and then kept, so sorting,
 * filters and a player search survive switching tabs. Used by the admin's
 * preview and the public page.
 */
export function SheetTabs({ sheets }: { sheets: { name: string; display: StatsGrid }[] }) {
  const players = useMemo(() => buildPlayerIndex(sheets), [sheets]);
  const tabs = useMemo(
    () => [...sheets.map((s) => s.name), ...(players.names.length > 0 ? [MY_STATS] : [])],
    [sheets, players]
  );

  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const wanted = decodeHash(hash);
  const found = tabs.indexOf(wanted);
  const active = found >= 0 ? found : 0;
  const [visited, setVisited] = useState<ReadonlySet<number>>(new Set());
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number, focus = false) {
    setVisited((prev) => new Set(prev).add(index));
    const url = `${window.location.pathname}${window.location.search}#${encodeURIComponent(tabs[index])}`;
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(TAB_EVENT));
    if (focus) tabRefs.current[index]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
  }

  if (tabs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs wrap onto further lines rather than scrolling sideways. */}
      <div
        role="tablist"
        aria-label="Sheets"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] p-1"
      >
        {tabs.map((name, i) => (
          <button
            key={`${i}:${name}`}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`sheet-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`sheet-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            // "My stats" is not a sheet, so it sits a little apart from them
            className={`${tabItem(i === active)} ${i >= sheets.length ? "ml-2" : ""}`}
          >
            {name}
          </button>
        ))}
      </div>
      {tabs.map((name, i) => (
        <div key={`${i}:${name}`} role="tabpanel" id={`sheet-panel-${i}`} aria-labelledby={`sheet-tab-${i}`} hidden={i !== active}>
          {(i === active || visited.has(i)) &&
            (i < sheets.length ? <SheetGrid grid={sheets[i].display} /> : <MyStats index={players} />)}
        </div>
      ))}
    </div>
  );
}
