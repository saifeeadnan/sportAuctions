"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

type RowError = { rowNumber: number; message: string };
type PreviewResult = {
  validCount: number;
  errors: RowError[];
  sample: Record<string, unknown>[];
};

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export function UploadRosterForm() {
  const router = useRouter();
  const [rosterName, setRosterName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("rosterName", rosterName);
      formData.set("mode", "preview");
      const res = await fetch("/api/rosters/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Preview failed"));
      setPreview(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("rosterName", rosterName);
      formData.set("mode", "commit");
      const res = await fetch("/api/rosters/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Import failed"));
      const data = await res.json();
      router.push(`/admin/rosters/${data.rosterId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <form onSubmit={handlePreview} className="flex flex-col gap-3 max-w-xl">
        <label className="flex flex-col gap-1 text-sm">
          Roster name
          <input
            required
            value={rosterName}
            onChange={(e) => setRosterName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          CSV or Excel file
          <input
            required
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="text-sm"
          />
        </label>
        <button type="submit" disabled={loading || !file} className={`${buttonSecondary} mt-2 self-start`}>
          {loading ? "Parsing…" : "Preview"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {preview && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {preview.validCount} valid player row(s) found
            {preview.errors.length > 0 &&
              `, ${preview.errors.length} row(s) skipped due to errors`}
            .
          </p>

          {preview.errors.length > 0 && (
            <ul className="text-sm text-red-600 flex flex-col gap-1">
              {preview.errors.map((err, i) => (
                <li key={i}>
                  Row {err.rowNumber}: {err.message}
                </li>
              ))}
            </ul>
          )}

          {preview.sample.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-black/10 dark:border-white/10">
                    <th className="py-2 pr-4 whitespace-nowrap">Name</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Position</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Age</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Login ID</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Default category</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Previous team</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Batting</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Bowling</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Fielding</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((row, i) => (
                    <tr key={i} className="border-b border-black/5 dark:border-white/5">
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.name ?? "")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.position ?? "—")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.age ?? "—")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.loginId ?? "—")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.defaultCategory ?? "—")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.previousTeam ?? "—")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.battingRating ?? "—")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.bowlingRating ?? "—")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.fieldingRating ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={loading || preview.validCount === 0}
            className={`${buttonPrimary} self-start`}
          >
            {loading ? "Importing…" : `Confirm & import ${preview.validCount} players`}
          </button>
        </div>
      )}
    </div>
  );
}
