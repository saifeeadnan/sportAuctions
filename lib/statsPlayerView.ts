import type { SheetSection } from "@/lib/statsSheetGrid";
import { classifyColumns } from "@/lib/statsTableView";

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

/** Finds every table with a name column, and the names in them. Works from the sheets as visitors receive them (hidden columns already gone). */
export function buildPlayerIndex(sheets: { name: string; sections: SheetSection[] }[]): PlayerIndex {
  const tables: IndexedTable[] = [];
  const seen = new Map<string, string>();

  for (const sheet of sheets) {
    for (const section of sheet.sections) {
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
  /** Which table of the index this came from — how two players' sections are matched up. */
  table: number;
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
 * every one of their rows are left out, and a "#" (position) column is shown as "Rank".
 */
export function playerStats(index: PlayerIndex, name: string): PlayerSection[] {
  const key = norm(name);
  if (key === "") return [];
  const sections: PlayerSection[] = [];

  for (const [tableId, table] of index.tables.entries()) {
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
    // a "#" column is the row's position in its list: shown as "Rank", unless the table already has a Rank column
    const hasRankColumn = table.header.some((h) => h.trim().toLowerCase() === "rank");
    const heading = (label: string, c: number) => {
      const shown = label.trim();
      if (shown === "#") return hasRankColumn ? "#" : "Rank";
      return shown || `Column ${c + 1}`;
    };
    const fields = table.header
      .map((label, c) => ({ c, label: heading(label, c), values: matches.map((row) => (row[c] ?? "").trim()) }))
      .filter((f) => !skip.has(f.c) && f.values.some((v) => v !== ""))
      .map(({ label, values }) => ({ label, values }));
    if (fields.length > 0) sections.push({ table: tableId, sheet: table.sheet, title: table.title, columns, fields });
  }
  return sections;
}

/** A table of a label and up to three values is narrow by nature: several fit side by side. A wider one needs the full width. */
export const isCompactSection = (section: { columns: unknown[] }): boolean => section.columns.length <= 3;

/**
 * Keeps the sections in order but gathers each run of compact ones into a group,
 * so a page of single-value leaderboard blocks reads as a grid, not one long column.
 */
export function groupSections<T extends { columns: unknown[] }>(sections: T[]): { compact: boolean; sections: T[] }[] {
  const groups: { compact: boolean; sections: T[] }[] = [];
  for (const section of sections) {
    const compact = isCompactSection(section);
    const last = groups[groups.length - 1];
    if (compact && last?.compact) last.sections.push(section);
    else groups.push({ compact, sections: [section] });
  }
  return groups;
}

/** Two players' data for one table, side by side: a column per row of each, a shared row per field. */
export type CompareSection = {
  table: number;
  sheet: string;
  title: string | null;
  /** In order: the first player's columns, then the second's. A player with nothing in this table gets one "—" column. */
  columns: { player: string; label: string }[];
  fields: { label: string; values: string[] }[];
};

const ABSENT = "—";

/**
 * Two players compared. Every table either appears in gets a section: fields
 * are the union of both players' fields (the first player's order, then any the
 * second has extra), and a cell is "—" where a player has no such field or no
 * row in that table at all.
 */
export function compareStats(index: PlayerIndex, first: string, second: string): CompareSection[] {
  const a = new Map(playerStats(index, first).map((s) => [s.table, s]));
  const b = new Map(playerStats(index, second).map((s) => [s.table, s]));
  const tables = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);

  return tables.map((table) => {
    const sa = a.get(table);
    const sb = b.get(table);
    const meta = (sa ?? sb)!;
    const columnsOf = (player: string, section: PlayerSection | undefined) =>
      section ? section.columns.map((label) => ({ player, label })) : [{ player, label: ABSENT }];
    const cellsOf = (section: PlayerSection | undefined, label: string) => {
      if (!section) return [ABSENT];
      const field = section.fields.find((f) => f.label === label);
      return field ? field.values : section.columns.map(() => ABSENT);
    };

    const labels = [...new Set([...(sa?.fields ?? []), ...(sb?.fields ?? [])].map((f) => f.label))];
    return {
      table,
      sheet: meta.sheet,
      title: meta.title,
      columns: [...columnsOf(first, sa), ...columnsOf(second, sb)],
      fields: labels.map((label) => ({ label, values: [...cellsOf(sa, label), ...cellsOf(sb, label)] })),
    };
  });
}

/** The index's own spelling of a name, if that player exists (ignoring case and spacing). */
export function findExactPlayer(index: PlayerIndex, name: string): string | null {
  const key = norm(name);
  if (key === "") return null;
  return index.names.find((n) => norm(n) === key) ?? null;
}

// Headings the image never shows, and headings it always makes room for (a
// "Total dismissals" column counts as dismissals).
const CARD_LEFT_OUT = new Set(["seasons", "innings", "no"]);
const CARD_ALWAYS = [/\bwickets?\b/, /\beconomy\b/, /\bdismissals?\b/];

/**
 * The figures for a player's shareable image: the fields of their overall
 * profile tables — one lone row, no leaderboard title — a few from each of the
 * first two, up to `max` in all, always in workbook order. Wickets, economy and
 * dismissals are always included wherever they sit in a table; seasons, innings
 * and not-outs never are. If there is no such table (only leaderboard blocks),
 * it falls back to any single-row table.
 */
export function cardStats(sections: PlayerSection[], max = 12): { label: string; value: string }[] {
  const lone = sections.filter((s) => s.columns.length === 1);
  const profiles = lone.filter((s) => s.title === null && s.fields.length >= 3);
  const chosen = (profiles.length > 0 ? profiles : lone).slice(0, 2);
  if (chosen.length === 0) return [];

  const perSection = Math.ceil(max / chosen.length);
  const out: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  const take = (section: PlayerSection, limit: number) => {
    // two tables often share a heading ("Matches"): show it once, from the first
    const candidates = section.fields.filter((field) => {
      const key = field.label.trim().toLowerCase();
      if (CARD_LEFT_OUT.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const always = candidates.filter((f) => CARD_ALWAYS.some((re) => re.test(f.label.toLowerCase()))).slice(0, limit);
    const rest = candidates.filter((f) => !always.includes(f)).slice(0, Math.max(0, limit - always.length));
    const kept = new Set([...always, ...rest]);
    for (const field of candidates) {
      if (out.length >= max) return;
      if (kept.has(field)) out.push({ label: field.label, value: field.values[0] });
      // not taken now: free to be taken by the top-up pass below (or another table)
      else seen.delete(field.label.trim().toLowerCase());
    }
  };
  // a few from each table first, then any space left is filled from what remains
  for (const section of chosen) take(section, perSection);
  for (const section of chosen) take(section, Infinity);
  return out;
}
