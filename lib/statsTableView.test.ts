import { describe, it, expect } from "vitest";
import { cellPasses, classifyColumns, columnWidths, compareCells, parseNumber, viewRows } from "@/lib/statsTableView";

describe("parseNumber", () => {
  it("reads the numbers Excel displays", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("43.861")).toBe(43.861);
    expect(parseNumber("12.5%")).toBe(12.5);
    expect(parseNumber("$3")).toBe(3);
    expect(parseNumber("-7")).toBe(-7);
    expect(parseNumber("−7")).toBe(-7);
    expect(parseNumber("(4.5)")).toBe(-4.5);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("1.2E+05")).toBe(120000);
    expect(parseNumber("1E-5")).toBe(0.00001);
  });

  it("is null for anything else", () => {
    for (const t of ["", "Hashim", "12 wickets", "2026-09-24", "N/A"]) expect(parseNumber(t), t).toBeNull();
  });
});

describe("compareCells", () => {
  const sorted = (cells: string[], dir: "asc" | "desc") => [...cells].sort((a, b) => compareCells(a, b, dir));

  it("orders numbers by value, not as text", () => {
    expect(sorted(["10", "9", "100", "1,000", "2"], "asc")).toEqual(["2", "9", "10", "100", "1,000"]);
    expect(sorted(["10", "9", "100"], "desc")).toEqual(["100", "10", "9"]);
  });

  it("orders text without regard to case, and numbers inside text naturally", () => {
    expect(sorted(["banana", "Apple", "cherry"], "asc")).toEqual(["Apple", "banana", "cherry"]);
    expect(sorted(["Team 10", "Team 9", "Team 1"], "asc")).toEqual(["Team 1", "Team 9", "Team 10"]);
  });

  it("always puts blanks last, in either direction, and numbers before text", () => {
    expect(sorted(["b", "", "10", "a", "  ", "2"], "asc")).toEqual(["2", "10", "a", "b", "", "  "]);
    expect(sorted(["b", "", "10", "a", "2"], "desc")).toEqual(["10", "2", "b", "a", ""]);
  });
});

describe("classifyColumns", () => {
  // A season-detail style table: name, team, year, result, then measures.
  const teams = ["Titans", "Knights", "Stallions"];
  const rows = Array.from({ length: 12 }, (_, i) => [
    `Player ${i}`,
    teams[i % 3],
    String(2022 + (i % 5)),
    i % 4 === 0 ? "Champion" : "",
    String(10 * i + 3),
    (i * 1.5).toFixed(2),
    String((i % 5) + 1),
  ]);
  const cols = classifyColumns(rows, 7);

  it("gives names a search box", () => {
    expect(cols[0]).toMatchObject({ numeric: false, filter: "search", options: [] });
  });

  it("gives a column that repeats a few values (a team, a result) a dropdown of them", () => {
    expect(cols[1]).toMatchObject({ numeric: false, filter: "select", options: ["Knights", "Stallions", "Titans"] });
    expect(cols[3]).toMatchObject({ filter: "select", options: ["Champion"] });
  });

  it("treats a year as something to pick, though it is a number", () => {
    expect(cols[2]).toMatchObject({ numeric: true, filter: "select", options: ["2022", "2023", "2024", "2025", "2026"] });
  });

  it("reserves room for the control: a dropdown shows its longest choice plus an arrow, a search box its hint", () => {
    expect(cols[2].controlChars).toBe(7); // "2026" + arrow
    expect(cols[1].controlChars).toBe("Stallions".length + 3); // 12, right at the cap
    // a long team name doesn't widen the dropdown: its open list shows the full names
    expect(classifyColumns([["A very long team name"], ["A very long team name"], ["Other"]], 1)[0].controlChars).toBe(12);
    expect(cols[0].controlChars).toBe(7);
    expect(cols[4].controlChars).toBe(0);
  });

  it("gives measures (runs, averages, counts) no filter at all", () => {
    for (const c of [4, 5, 6]) expect(cols[c], String(c)).toMatchObject({ numeric: true, filter: "none", options: [] });
  });

  it("does not mistake big or non-year numbers for years", () => {
    expect(classifyColumns([["490736"], ["760803"]], 1)[0].filter).toBe("none");
    expect(classifyColumns([["1850"], ["2500"]], 1)[0].filter).toBe("none");
  });

  it("searches, not lists, a column whose values are all different, long, or several-at-once", () => {
    const unique = classifyColumns([["a"], ["b"], ["c"], ["d"]], 1)[0];
    expect(unique.filter).toBe("search");
    const long = "x".repeat(41);
    expect(classifyColumns([[long], [long], ["y"], ["y"]], 1)[0].filter).toBe("search");
    expect(classifyColumns([["2022, 2023"], ["2022, 2023"], ["2024"], ["2024"]], 1)[0].filter).toBe("search");
    const many = Array.from({ length: 60 }, (_, i) => [`team ${i % 30}`]);
    expect(classifyColumns(many, 1)[0].filter).toBe("search"); // 30 distinct values is too long a list
  });

  it("offers nothing for an empty column, and right-aligns a mostly-numeric one", () => {
    expect(classifyColumns([[""], [""]], 1)[0]).toEqual({ numeric: false, filter: "none", options: [], controlChars: 0 });
    expect(classifyColumns([["1"], ["2"], ["3"], ["4"], ["oops"]], 1)[0].numeric).toBe(true);
  });
});

describe("cellPasses", () => {
  it("lets everything through when nothing is chosen or typed, or the column has no filter", () => {
    expect(cellPasses("select", "", "Titans")).toBe(true);
    expect(cellPasses("search", "   ", "Hashim")).toBe(true);
    expect(cellPasses("none", "anything", "Hashim")).toBe(true);
  });

  it("matches a chosen value exactly, ignoring case and spaces", () => {
    expect(cellPasses("select", "Titans", "titans ")).toBe(true);
    expect(cellPasses("select", "Titan", "Titans")).toBe(false);
    expect(cellPasses("select", "2024", "2024")).toBe(true);
  });

  it("matches typed text anywhere in the cell, ignoring case", () => {
    expect(cellPasses("search", "hash", "Hashim")).toBe(true);
    expect(cellPasses("search", "abdul qadir", "Abdul Qadir Jivanjee")).toBe(true);
    expect(cellPasses("search", "hash", "Abdul Qadir")).toBe(false);
    expect(cellPasses("search", "(2022-2026)", "CAREER (2022-2026)")).toBe(true);
    expect(cellPasses("search", "<b>", "a <b> c")).toBe(true);
  });
});

describe("viewRows", () => {
  const rows = [
    ["Hashim", "Titans", "2025", "174"],
    ["Saifee", "Knights", "2026", "90"],
    ["Pindi", "Titans", "2026", "120"],
    ["Rangila", "Knights", "2025", ""],
    ["Hashem", "Stallions", "2026", "7"],
    ["Zed", "Stallions", "2025", "8"],
  ];
  const columns = classifyColumns(rows, 4);
  const names = (r: string[][]) => r.map((x) => x[0]);

  it("knows which of these columns can be filtered", () => {
    expect(columns.map((c) => c.filter)).toEqual(["search", "select", "select", "none"]);
  });

  it("returns the sheet order when nothing is sorted or filtered", () => {
    expect(viewRows(rows, columns, ["", "", "", ""], null)).toEqual(rows);
  });

  it("sorts by any column, including a measure, both ways, leaving blanks last", () => {
    expect(names(viewRows(rows, columns, ["", "", "", ""], { column: 3, direction: "desc" }))).toEqual(["Hashim", "Pindi", "Saifee", "Zed", "Hashem", "Rangila"]);
    expect(names(viewRows(rows, columns, ["", "", "", ""], { column: 3, direction: "asc" }))).toEqual(["Hashem", "Zed", "Saifee", "Pindi", "Hashim", "Rangila"]);
  });

  it("keeps the sheet order for equal values", () => {
    expect(names(viewRows(rows, columns, ["", "", "", ""], { column: 1, direction: "asc" }))).toEqual(["Saifee", "Rangila", "Hashem", "Zed", "Hashim", "Pindi"]);
  });

  it("combines filters across columns, then sorts what is left", () => {
    expect(names(viewRows(rows, columns, ["", "Titans", "2026", ""], null))).toEqual(["Pindi"]);
    expect(names(viewRows(rows, columns, ["has", "", "", ""], null))).toEqual(["Hashim", "Hashem"]);
    expect(names(viewRows(rows, columns, ["", "", "2026", ""], { column: 0, direction: "asc" }))).toEqual(["Hashem", "Pindi", "Saifee"]);
    expect(viewRows(rows, columns, ["zzz", "", "", ""], null)).toEqual([]);
  });

  it("ignores anything typed for a column that has no filter", () => {
    expect(viewRows(rows, columns, ["", "", "", ">100"], null)).toEqual(rows);
  });

  it("does not change the rows it was given", () => {
    const copy = JSON.stringify(rows);
    viewRows(rows, columns, ["", "Titans", "", ""], { column: 0, direction: "desc" });
    expect(JSON.stringify(rows)).toBe(copy);
  });
});

describe("columnWidths", () => {
  const d = { charPx: 6, padPx: 8 };
  // a measure (runs), a year/dropdown column (a number with a control under its heading), and plain text
  const measure = { numeric: true, controlChars: 0 };
  const year = { numeric: true, controlChars: 7 };
  const text = { numeric: false, controlChars: 0 };
  const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

  it("adds up to 100 percent", () => {
    const widths = columnWidths(["#", "Player", "Runs"], [["1", "Abdul Qadir Lashkarwala", "174"], ["2", "Hashim", "90"]], [measure, text, measure], d);
    expect(sum(widths)).toBeCloseTo(100, 6);
  });

  it("keeps a name column as wide as its text and gives all the spare room to the measures", () => {
    // at 10px a character with no padding: the name asks for 110px, each measure 50px — 210px of a 1200px reference
    const widths = columnWidths(["N", "R", "W"], [["Hashim Khan", "12345", "12345"]], [text, measure, measure], { charPx: 10, padPx: 0 });
    // the spare 990px is shared by the two measures, 495px each; the table still fills its width
    expect(widths[0]).toBeCloseTo((110 / 1200) * 100, 6);
    expect(widths[1]).toBeCloseTo((545 / 1200) * 100, 6);
    expect(widths[2]).toBeCloseTo((545 / 1200) * 100, 6);
  });

  it("gives none of the spare room to a year, or to a team", () => {
    // Year (a dropdown column), Team (text) and two measures: only Wins and Losses grow
    const widths = columnWidths(["Y", "T", "W", "L"], [["2026", "Stallions", "3", "1"]], [year, text, measure, measure], { charPx: 10, padPx: 0 });
    // Year asks for 70px (7 characters for its dropdown), Team 90px, each measure 20px: 200px, so 1000px is spare
    expect(widths[0]).toBeCloseTo((70 / 1200) * 100, 6);
    expect(widths[1]).toBeCloseTo((90 / 1200) * 100, 6);
    expect(widths[2]).toBeCloseTo((520 / 1200) * 100, 6);
    expect(widths[3]).toBeCloseTo((520 / 1200) * 100, 6);
  });

  it("a table with no measures shares the spare room among all its columns", () => {
    const widths = columnWidths(["A", "B"], [["aaaaa", "bbbbbbbbbb"]], [text, text], { charPx: 10, padPx: 0 });
    // they ask for 50px and 100px; the spare 1050px is shared equally
    expect(widths[0]).toBeCloseTo((575 / 1200) * 100, 6);
    expect(widths[1]).toBeCloseTo((625 / 1200) * 100, 6);
  });

  it("caps a huge cell at 24 characters, and a long heading asks for at most 9", () => {
    // col 0: a one-character cell under a 20-letter word, which asks for 9 characters (8 + 6*9 = 62px);
    // col 1: a 500-character cell, capped at 24 (8 + 6*24 = 152px)
    const widths = columnWidths(["Supercalifragilistic", "x"], [["1", "y".repeat(500)]], [text, text], d);
    // both are text, so the spare room is shared equally and the gap between them is the gap in what they asked for
    expect(((widths[1] - widths[0]) / 100) * 1200).toBeCloseTo(152 - 62, 6);
  });

  it("gives a single-digit column room for a short heading such as Matches", () => {
    const widths = columnWidths(["Matches", "Runs"], [["3", "174"]], [measure, measure], { charPx: 10, padPx: 0 });
    // Matches asks for its 7 letters (70px), Runs for its 4 (40px); the 1090px spare is shared equally
    expect(((widths[0] - widths[1]) / 100) * 1200).toBeCloseTo(70 - 40, 6);
  });

  it("handles a table with no rows", () => {
    expect(sum(columnWidths(["A", "B"], [], [text, text], d))).toBeCloseTo(100, 6);
  });

  it("when space is short, headings give way before figures do", () => {
    // 20 columns headed "H" and 10 headed "Individual" (asks for 9 characters), all holding "12345": they ask for
    // 20 x 38 + 10 x 62 = 1380px, over the 1200px reference, so the 180px excess comes out of the headings
    const header = [...Array.from({ length: 20 }, () => "H"), ...Array.from({ length: 10 }, () => "Individual")];
    const row = header.map(() => "12345");
    const widths = columnWidths(header, [row], header.map(() => measure), { charPx: 6, padPx: 8 });
    expect(widths[0]).toBeCloseTo((38 / 1200) * 100, 6); // a figure keeps the width of its values
    expect(widths[20]).toBeCloseTo((44 / 1200) * 100, 6); // 62 - 18: the long headings gave the excess up
  });

  it("when the columns ask for too much, squeezes text and leaves measures whole", () => {
    // 20 measures of "12345" plus two long-name columns, at a density where they cannot all fit in 1200px
    const header = [...Array.from({ length: 20 }, (_, i) => `n${i}`), "Player", "Team"];
    const cols = header.map((_, i) => (i < 20 ? measure : text));
    const row = [...Array.from({ length: 20 }, () => "12345"), "Abdul Qadir Lashkarwala", "Stallions of Westchester"];
    const widths = columnWidths(header, [row], cols, { charPx: 8, padPx: 12 });
    // Together they ask for 20 x 52 + 196 + 204 = 1440px. The names give up the 240px excess
    // (down to about 80px each) so each number keeps its own 52px of the 1200px.
    expect(widths[0]).toBeCloseTo((52 / 1200) * 100, 6);
    expect(widths[20]).toBeCloseTo((80 / 1200) * 100, 0);
    expect(sum(widths)).toBeCloseTo(100, 6);
  });

  it("gives a column room for its filter control, not just its values", () => {
    // 30 columns ask for more than fits, so each share is just what it asked for
    const header = Array.from({ length: 30 }, (_, i) => `n${i}`);
    const rows = [header.map(() => "2026")];
    const dense = { charPx: 8, padPx: 12 };
    const plain = columnWidths(header, rows, header.map(() => measure), dense);
    const withDropdown = columnWidths(header, rows, header.map((_, i) => ({ numeric: true, controlChars: i === 0 ? 12 : 0 })), dense);
    expect(withDropdown[0]).toBeGreaterThan(plain[0]);
    expect(sum(withDropdown)).toBeCloseTo(100, 6);
  });
});
