"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { StatsGrid } from "@/lib/statsUpload/schema";
import { tabItem } from "@/lib/ui";
import { SheetGrid } from "@/components/stats/SheetGrid";

const TAB_EVENT = "stats-sheet-tab";

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
 * The sheets of a workbook as Excel-style tabs. The open tab lives in the URL
 * hash (#Sheet%20name), so a shared link can open on a particular sheet and a
 * refresh keeps the place. A sheet's tables are built the first time its tab is
 * opened and then kept, so sorting and filters survive switching tabs. Used by
 * the admin's preview and the public page.
 */
export function SheetTabs({ sheets }: { sheets: { name: string; display: StatsGrid }[] }) {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const wanted = decodeHash(hash);
  const found = sheets.findIndex((s) => s.name === wanted);
  const active = found >= 0 ? found : 0;
  const [visited, setVisited] = useState<ReadonlySet<number>>(new Set());
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number, focus = false) {
    setVisited((prev) => new Set(prev).add(index));
    const url = `${window.location.pathname}${window.location.search}#${encodeURIComponent(sheets[index].name)}`;
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(TAB_EVENT));
    if (focus) tabRefs.current[index]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = sheets.length - 1;
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

  if (sheets.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs wrap onto further lines rather than scrolling sideways. */}
      <div
        role="tablist"
        aria-label="Sheets"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] p-1"
      >
        {sheets.map((s, i) => (
          <button
            key={s.name}
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
            className={tabItem(i === active)}
          >
            {s.name}
          </button>
        ))}
      </div>
      {sheets.map((s, i) => (
        <div key={s.name} role="tabpanel" id={`sheet-panel-${i}`} aria-labelledby={`sheet-tab-${i}`} hidden={i !== active}>
          {(i === active || visited.has(i)) && <SheetGrid grid={s.display} />}
        </div>
      ))}
    </div>
  );
}
