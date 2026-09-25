import { splitSheet } from "@/lib/statsSheetGrid";
import { classifyColumns } from "@/lib/statsTableView";
import type { StatsGrid } from "@/lib/statsUpload/schema";

// "My stats": find one player across every sheet and lay their rows out
// transposed — each of a table's columns becomes a row — so a 27-column table
// reads down the page instead of across it. Pure and browser-safe; it works on
// the display text of the sheets, like everything the public page shows.

/** Headings that name a person ("Player", "Name", "Player (as shown)") — but not a team, file or id. */
const NAME_HEADING = /player|name/i;
const NOT_A_PERSON = /team|file|sheet|source|tournament|alias|\bids?\b/i;

export function isNameHeading(label: string): boolean {
  return NAME_HEADING.test(label) && !NOT_A_PERSON.test(label);
}

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

type IndexedTable = {
  sheet: string;
  title: string | null;
  header: string[];
  rows: string[][];
  /** The column holding the player's name. */
  nameCol: number;
  /** Columns that tell one of a player's rows from another (year, team, category), for column headings. */
  labelCols: number[];
};

export type PlayerIndex = {
  tables: IndexedTable[];
  /** Every distinct player name, sorted, as first spelled. */
  names: string[];
};

/** Finds every table with a name column, and the names in them. */
export function buildPlayerIndex(sheets: { name: string; display: StatsGrid }[]): PlayerIndex {
  const tables: IndexedTable[] = [];
  const seen = new Map<string, string>();

  for (const sheet of sheets) {
    for (const section of splitSheet(sheet.display)) {
      if (section.kind !== "table") continue;
      const nameCol = section.header.findIndex((label) => isNameHeading(label));
      if (nameCol < 0) continue;

      // a person's name is text — skip blanks and numbers (ids, totals) in that column
      const names = section.rows.map((row) => (row[nameCol] ?? "").trim()).filter((v) => v !== "" && !/^[\d\s.,%$-]+$/.test(v));
      if (names.length === 0) continue;
      for (const name of names) if (!seen.has(norm(name))) seen.set(norm(name), name);

      const info = classifyColumns(section.rows, section.header.length);
      const labelCols = info.flatMap((col, c) => (c !== nameCol && col.filter === "select" ? [c] : [])).slice(0, 2);
      tables.push({ sheet: sheet.name, title: section.title, header: section.header, rows: section.rows, nameCol, labelCols });
    }
  }
  const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  return { tables, names: [...seen.values()].sort((a, b) => collator.compare(a, b)) };
}

/**
 * Player names matching what was typed, best first: an exact name, then names
 * starting with it, then names with a word starting with it, then any that
 * contain every word typed (in any order — "qadir abdul" finds Abdul Qadir).
 */
export function findPlayers(index: PlayerIndex, query: string, limit = Infinity): string[] {
  const typed = norm(query);
  if (typed === "") return [];
  const words = typed.split(" ");
  const scored = index.names.flatMap((name) => {
    const key = norm(name);
    if (!words.every((w) => key.includes(w))) return [];
    const score = key === typed ? 0 : key.startsWith(typed) ? 1 : key.split(" ").some((part) => part.startsWith(words[0])) ? 2 : 3;
    return [{ name, score }];
  });
  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return scored.slice(0, limit).map((s) => s.name);
}

/** One table's worth of a player's data, transposed: a row per field, a column per matching row. */
export type PlayerSection = {
  sheet: string;
  title: string | null;
  /** One heading per matching row — "2026 · Knights" for a season, "Value" for a lone row. */
  columns: string[];
  fields: { label: string; values: string[] }[];
};

/**
 * Everything one player has, from every table they appear in, in sheet order.
 * A table where they have several rows (a row per season) gets a column per row,
 * headed by what tells the rows apart; the columns that did that (year, team)
 * are then in the headings, not repeated as fields. Fields that are blank in
 * every one of their rows are left out.
 */
export function playerStats(index: PlayerIndex, name: string): PlayerSection[] {
  const key = norm(name);
  if (key === "") return [];
  const sections: PlayerSection[] = [];

  for (const table of index.tables) {
    const matches = table.rows.filter((row) => norm(row[table.nameCol] ?? "") === key);
    if (matches.length === 0) continue;

    const labelled = matches.length > 1 && table.labelCols.length > 0;
    const counts = new Map<string, number>();
    const columns = matches.map((row, i) => {
      const base = labelled
        ? table.labelCols.map((c) => (row[c] ?? "").trim()).filter((v) => v !== "").join(" · ")
        : matches.length > 1
          ? ""
          : "Value";
      const label = base || `Row ${i + 1}`;
      const n = (counts.get(label) ?? 0) + 1;
      counts.set(label, n);
      return n > 1 ? `${label} (${n})` : label;
    });

    const skip = new Set([table.nameCol, ...(labelled ? table.labelCols : [])]);
    const fields = table.header
      .map((label, c) => ({ c, label: label.trim() || `Column ${c + 1}`, values: matches.map((row) => (row[c] ?? "").trim()) }))
      .filter((f) => !skip.has(f.c) && f.values.some((v) => v !== ""))
      .map(({ label, values }) => ({ label, values }));
    if (fields.length > 0) sections.push({ sheet: table.sheet, title: table.title, columns, fields });
  }
  return sections;
}

/** A table of a label and up to three values is narrow by nature: several fit side by side. A wider one needs the full width. */
export const isCompactSection = (section: PlayerSection): boolean => section.columns.length <= 3;

/**
 * Keeps the sections in order but gathers each run of compact ones into a group,
 * so a page of single-value leaderboard blocks reads as a grid, not one long column.
 */
export function groupSections(sections: PlayerSection[]): { compact: boolean; sections: PlayerSection[] }[] {
  const groups: { compact: boolean; sections: PlayerSection[] }[] = [];
  for (const section of sections) {
    const compact = isCompactSection(section);
    const last = groups[groups.length - 1];
    if (compact && last?.compact) last.sections.push(section);
    else groups.push({ compact, sections: [section] });
  }
  return groups;
}
