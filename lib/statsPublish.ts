import { splitSheet, type SheetSection } from "@/lib/statsSheetGrid";
import type { StatsGrid } from "@/lib/statsUpload/schema";

// What a visitor is given for one sheet: its tables and text, minus any
// columns the admin hid. Worked out on the SERVER, so a hidden column never
// reaches the public page — it is not just concealed in the browser. Pure and
// shared by the service, the admin preview and the tests.

/** The extra tab that searches players; not a sheet, so it can't be renamed or hidden. */
export const MY_STATS_TAB = "My stats";
/** How the per-upload "opens on this tab" setting refers to that tab. */
export const MY_STATS_LANDING = "@my-stats";

/** A sheet ready to show: its tab name (the admin's label, else the sheet's own name) and its content. */
export type PublishedSheet = { name: string; sections: SheetSection[] };

const norm = (text: string) => text.trim().toLowerCase();

/** Every distinct table heading among a sheet's sections, in order of first appearance — the choices for hiding columns. */
export function headingsOfSections(sections: SheetSection[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const section of sections) {
    if (section.kind !== "table") continue;
    for (const heading of section.header) {
      const h = heading.trim();
      if (h === "" || seen.has(norm(h))) continue;
      seen.add(norm(h));
      out.push(h);
    }
  }
  return out;
}

/** The same, for a sheet's raw grid. */
export function sheetHeadings(display: StatsGrid): string[] {
  return headingsOfSections(splitSheet(display));
}

/**
 * A sheet's sections with every column whose heading is in `hidden` removed
 * (headings match ignoring case and spacing, in every table of the sheet). A
 * table left with no columns disappears.
 */
export function sectionsForSheet(display: StatsGrid, hidden: string[]): SheetSection[] {
  const hide = new Set(hidden.map(norm).filter((h) => h !== ""));
  const sections = splitSheet(display);
  if (hide.size === 0) return sections;

  return sections.flatMap((section): SheetSection[] => {
    if (section.kind !== "table") return [section];
    const keep = section.header.flatMap((heading, c) => (hide.has(norm(heading)) ? [] : [c]));
    if (keep.length === section.header.length) return [section];
    if (keep.length === 0) return [];
    return [
      {
        ...section,
        header: keep.map((c) => section.header[c]),
        rows: section.rows.map((row) => keep.map((c) => row[c] ?? "")),
      },
    ];
  });
}

/** Cleans a list of headings to hide: text only, trimmed, no blanks or duplicates, sensible lengths. */
export function cleanHiddenColumns(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const heading = value.trim().slice(0, 100);
    if (heading === "" || seen.has(norm(heading))) continue;
    seen.add(norm(heading));
    out.push(heading);
    if (out.length >= 200) break;
  }
  return out;
}

export type PreviousSetup = {
  landingTab: string | null;
  sheets: { name: string; position: number; label: string | null; hiddenColumns: string[] }[];
};

/**
 * Carries an earlier upload's setup onto a fresh one, so a corrected file keeps
 * what the admin already arranged: each sheet with the same name keeps its tab
 * label and hidden columns; the opening tab carries over if that sheet (or My
 * stats) is still there; and if the fresh file has exactly the same sheets the
 * tab order carries over too. Settings are keyed by the sheet name, lower-cased.
 */
export function inheritSettings(
  newNames: string[],
  previous: PreviousSetup | null
): {
  order: string[];
  settings: Map<string, { label: string | null; hiddenColumns: string[] }>;
  landingTab: string | null;
} {
  const settings = new Map<string, { label: string | null; hiddenColumns: string[] }>();
  if (!previous) return { order: newNames, settings, landingTab: null };

  const before = new Map(previous.sheets.map((s) => [norm(s.name), s]));
  for (const name of newNames) {
    const match = before.get(norm(name));
    if (match) settings.set(norm(name), { label: match.label, hiddenColumns: match.hiddenColumns });
  }

  const sameSheets = newNames.length === previous.sheets.length && newNames.every((n) => before.has(norm(n)));
  const order = sameSheets ? [...newNames].sort((a, b) => before.get(norm(a))!.position - before.get(norm(b))!.position) : newNames;

  let landingTab: string | null = null;
  if (previous.landingTab === MY_STATS_LANDING) landingTab = MY_STATS_LANDING;
  else if (previous.landingTab) landingTab = newNames.find((n) => norm(n) === norm(previous.landingTab!)) ?? null;

  return { order, settings, landingTab };
}
