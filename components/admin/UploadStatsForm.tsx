"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseStatsFile, type ParsedWorkbook } from "@/lib/statsUpload/parseWorkbook";
import { STATS_LIMITS, validateStatsSheets } from "@/lib/statsUpload/schema";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

const PREVIEW_ROWS = 5;
const PREVIEW_COLUMNS = 6;

/**
 * Pick a workbook, tick the sheets to load, upload. The file is read in this
 * browser tab (see lib/statsUpload/parseWorkbook.ts for why that is safe and
 * a server-side parse is not); the server receives the original file plus the
 * ticked sheets as plain grids.
 */
export function UploadStatsForm({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [previewIndex, setPreviewIndex] = useState(0);
  const [label, setLabel] = useState("");
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Changing the key remounts the file input, which is how "Clear" empties it.
  const [inputKey, setInputKey] = useState(0);

  function reset() {
    setFile(null);
    setWorkbook(null);
    setPicked(new Set());
    setPreviewIndex(0);
    setLabel("");
    setError(null);
    setInputKey((k) => k + 1);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    setDone(null);
    setError(null);
    setWorkbook(null);
    setPicked(new Set());
    setPreviewIndex(0);
    setFile(chosen);
    if (!chosen) return;
    setLabel(chosen.name.replace(/\.[^.]+$/, "").slice(0, STATS_LIMITS.maxLabelChars));
    setParsing(true);
    try {
      const parsed = await parseStatsFile(chosen);
      setWorkbook(parsed);
      // Everything loadable and visible starts ticked; hidden sheets are
      // usually working sheets the author did not mean to show.
      setPicked(new Set(parsed.sheets.flatMap((s, i) => (!s.problem && !s.hidden ? [i] : []))));
      setPreviewIndex(Math.max(0, parsed.sheets.findIndex((s) => !s.problem)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  }

  function toggle(index: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !workbook) return;
    const chosen = workbook.sheets
      .filter((_, i) => picked.has(i))
      .map((s) => ({ name: s.name, display: s.display, values: s.values }));
    setUploading(true);
    setError(null);
    try {
      // The same check the server runs, so a too-big selection fails here with
      // a clear message instead of after a long upload.
      validateStatsSheets(chosen);
      const formData = new FormData();
      formData.set("file", file);
      formData.set("sheets", JSON.stringify(chosen));
      formData.set("label", label);
      const res = await fetch(`/api/leagues/${leagueId}/tournament-stats`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Upload failed"));
      setDone(`Loaded ${chosen.length} sheet${chosen.length === 1 ? "" : "s"} from ${file.name}.`);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const sheets = workbook?.sheets ?? [];
  const loadable = sheets.flatMap((s, i) => (s.problem ? [] : [i]));
  const preview = sheets[previewIndex];
  const uploadLabel = uploading
    ? "Uploading…"
    : picked.size === 0
      ? "Upload"
      : `Upload ${picked.size} sheet${picked.size === 1 ? "" : "s"}`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4 max-w-3xl">
      <label className="flex flex-col gap-1 text-sm">
        Excel (.xlsx, .xls) or CSV file
        <input
          key={inputKey}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFile}
          className={`text-sm ${inputClass}`}
        />
      </label>
      {parsing && <p className="text-sm text-black/60 dark:text-white/60">Reading the file…</p>}

      {workbook && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium mb-1">
              Sheets to load{" "}
              <span className="font-normal text-black/50 dark:text-white/50">
                — each becomes a tab, and every loaded sheet is public once you publish
              </span>
            </legend>
            <div className="flex items-center gap-3 text-xs">
              <button type="button" className="underline underline-offset-2" onClick={() => setPicked(new Set(loadable))}>
                Select all
              </button>
              <button type="button" className="underline underline-offset-2" onClick={() => setPicked(new Set())}>
                Select none
              </button>
              <span className="text-black/50 dark:text-white/50">
                {picked.size} of {sheets.length} sheet{sheets.length === 1 ? "" : "s"} will be loaded
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5 rounded-lg border border-black/10 dark:border-white/10">
              {sheets.map((s, i) => (
                <li
                  key={s.name}
                  className={`flex items-center gap-3 px-3 py-2 text-sm ${i === previewIndex ? "bg-black/[0.03] dark:bg-white/[0.05]" : ""}`}
                  onMouseEnter={() => !s.problem && setPreviewIndex(i)}
                >
                  <label className="flex flex-1 min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={picked.has(i)}
                      disabled={s.problem !== null}
                      onChange={() => toggle(i)}
                      onFocus={() => !s.problem && setPreviewIndex(i)}
                    />
                    <span className="truncate font-medium">{s.name}</span>
                    {s.hidden && <span className="text-xs text-black/50 dark:text-white/50">(hidden in Excel)</span>}
                  </label>
                  <span className="text-xs text-black/50 dark:text-white/50 whitespace-nowrap">
                    {s.problem ?? `${s.rowCount.toLocaleString("en-US")} rows × ${s.columnCount} columns`}
                  </span>
                </li>
              ))}
            </ul>
          </fieldset>

          {preview && !preview.problem && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-black/50 dark:text-white/50">
                Preview of “{preview.name}” — first {Math.min(PREVIEW_ROWS, preview.rowCount)} rows
              </p>
              <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full table-fixed text-xs border-collapse">
                  <tbody>
                    {preview.display.slice(0, PREVIEW_ROWS).map((row, r) => (
                      <tr key={r} className="border-b border-black/5 dark:border-white/5 last:border-0">
                        {row.slice(0, PREVIEW_COLUMNS).map((cell, c) => (
                          <td key={c} className="px-2 py-1 align-top break-words [overflow-wrap:anywhere]">
                            {cell === null ? "" : String(cell)}
                          </td>
                        ))}
                        {row.length > PREVIEW_COLUMNS && (
                          <td className="w-6 px-1 py-1 text-black/40 dark:text-white/40" title={`${row.length - PREVIEW_COLUMNS} more columns`}>
                            …
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1 text-sm max-w-md">
            Label
            <input
              type="text"
              value={label}
              maxLength={STATS_LIMITS.maxLabelChars}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. 2022–2026 tournament statistics"
              className={inputClass}
            />
            <span className="text-xs text-black/50 dark:text-white/50">
              Shown under the league name on the public page. The original file is kept whole for your own
              download — only the ticked sheets are ever shown to anyone.
            </span>
          </label>
        </>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {done && <p className="text-sm text-emerald-700 dark:text-emerald-400">{done}</p>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={uploading || !workbook || picked.size === 0} className={buttonPrimary}>
          {uploadLabel}
        </button>
        {file && (
          <button type="button" onClick={reset} disabled={uploading} className={buttonSecondary}>
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
