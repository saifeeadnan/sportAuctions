import { STATS_LIMITS, type StatsCell, type StatsGrid } from "@/lib/statsUpload/schema";
import { cropGrid, gridExtent } from "@/lib/statsSheetGrid";

// Runs in the uploading admin's own BROWSER, never on the server. The `xlsx`
// (SheetJS) parser has unpatched prototype-pollution and ReDoS advisories
// with no fix on npm, which is why lib/services/roster.service.ts and
// playerPoints.service.ts refuse Excel and run it against nothing but CSV.
// Reading a file the admin picked, inside their own tab, is the one place the
// risk doesn't reach a server: the service stores the original bytes untouched
// and only ever validates the plain grids this produces. Both libraries are
// imported lazily so they stay out of every page's initial bundle.

export type ParsedSheet = {
  name: string;
  /** Hidden (or very hidden) in Excel — offered but unticked by default. */
  hidden: boolean;
  /** Text as Excel shows it — what the public page renders. */
  display: StatsGrid;
  /** Raw numbers — what the pivot builder aggregates. */
  values: StatsGrid;
  rowCount: number;
  columnCount: number;
  /** Set when the sheet can't be loaded (empty, or over a size cap). */
  problem: string | null;
};

export type ParsedWorkbook = { sheets: ParsedSheet[] };

type Xlsx = typeof import("xlsx");

const EXCEL_EXT = /\.(xlsx|xlsm|xls)$/i;
const CSV_EXT = /\.csv$/i;

// SheetJS builds date cells as LOCAL-time Dates (a date-only cell is local
// midnight), so read them back with local getters — toISOString() would shift
// the day for anyone west of Greenwich.
function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
  return hasTime ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}

/** One worksheet → display and values grids, cropped to the used area. */
function readSheet(XLSX: Xlsx, ws: import("xlsx").WorkSheet): { display: StatsGrid; values: StatsGrid } {
  const ref = ws["!ref"];
  if (!ref) return { display: [], values: [] };
  const range = XLSX.utils.decode_range(ref);
  const display: StatsGrid = [];
  const values: StatsGrid = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const drow: StatsCell[] = [];
    const vrow: StatsCell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as import("xlsx").CellObject | undefined;
      let d: StatsCell = null;
      let v: StatsCell = null;
      if (cell && cell.v !== undefined && cell.v !== null) {
        switch (cell.t) {
          case "n": {
            const n = cell.v as number;
            if (Number.isFinite(n)) {
              v = n;
              d = XLSX.utils.format_cell(cell) || String(n);
            }
            break;
          }
          case "s": {
            const s = String(cell.v);
            v = s === "" ? null : s;
            d = v;
            break;
          }
          case "b":
            v = d = cell.v ? "TRUE" : "FALSE";
            break;
          case "d": {
            const dt = cell.v instanceof Date ? cell.v : new Date(String(cell.v));
            if (!Number.isNaN(dt.getTime())) {
              v = isoDate(dt);
              d = cell.w || v;
            }
            break;
          }
          case "e":
            // A formula error such as #N/A — show what Excel showed.
            v = d = cell.w || "#ERROR";
            break;
        }
      }
      drow.push(d);
      vrow.push(v);
    }
    display.push(drow);
    values.push(vrow);
  }
  const { rows, cols } = gridExtent(display, values);
  return { display: cropGrid(display, rows, cols), values: cropGrid(values, rows, cols) };
}

function summarize(name: string, display: StatsGrid, hidden: boolean): ParsedSheet {
  const rowCount = display.length;
  const columnCount = display[0]?.length ?? 0;
  let problem: string | null = null;
  if (rowCount === 0 || columnCount === 0) problem = "Empty sheet";
  else if (rowCount > STATS_LIMITS.maxRowsPerSheet) {
    problem = `${rowCount.toLocaleString("en-US")} rows — over the ${STATS_LIMITS.maxRowsPerSheet.toLocaleString("en-US")} row limit`;
  } else if (columnCount > STATS_LIMITS.maxColumnsPerSheet) {
    problem = `${columnCount} columns — over the ${STATS_LIMITS.maxColumnsPerSheet} column limit`;
  } else if (name.length > STATS_LIMITS.maxSheetNameChars) {
    problem = `Name longer than ${STATS_LIMITS.maxSheetNameChars} characters`;
  }
  return { name, hidden, display, values: [], rowCount, columnCount, problem };
}

async function parseExcel(file: File): Promise<ParsedWorkbook> {
  const mod = await import("xlsx");
  const XLSX: Xlsx = (mod as unknown as { default?: Xlsx }).default ?? mod;
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheets = wb.SheetNames.map((name, i) => {
    const { display, values } = readSheet(XLSX, wb.Sheets[name]);
    const hidden = (wb.Workbook?.Sheets?.[i]?.Hidden ?? 0) !== 0;
    return { ...summarize(name, display, hidden), values };
  });
  return { sheets };
}

async function parseCsv(file: File): Promise<ParsedWorkbook> {
  const Papa = (await import("papaparse")).default;
  const text = (await file.text()).replace(/^\uFEFF/, "");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const rows = parsed.data.filter((row) => Array.isArray(row));
  const display: StatsGrid = rows.map((row) => row.map((cell) => (cell === "" ? null : String(cell))));
  const values: StatsGrid = display.map((row) =>
    row.map((cell) => {
      if (cell === null) return null;
      const t = String(cell).trim();
      return t !== "" && Number.isFinite(Number(t)) ? Number(t) : cell;
    })
  );
  const { rows: usedRows, cols } = gridExtent(display);
  const name = file.name.replace(CSV_EXT, "").trim() || "Sheet1";
  const cropped = cropGrid(display, usedRows, cols);
  return { sheets: [{ ...summarize(name, cropped, false), values: cropGrid(values, usedRows, cols) }] };
}

/**
 * Reads an .xlsx / .xls / .csv file into its sheets. A CSV is a workbook of
 * one sheet, named after the file. Throws an Error with a message fit to show
 * the admin for an unsupported or oversized file.
 */
export async function parseStatsFile(file: File): Promise<ParsedWorkbook> {
  if (file.size === 0) throw new Error("The file is empty");
  if (file.size > STATS_LIMITS.maxFileBytes) throw new Error("The file must be 10MB or smaller");
  if (EXCEL_EXT.test(file.name)) return parseExcel(file);
  if (CSV_EXT.test(file.name)) return parseCsv(file);
  throw new Error("Choose an Excel (.xlsx, .xls) or CSV file");
}
