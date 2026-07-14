"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RowError = { rowNumber: number; message: string };
type PreviewResult = {
  validCount: number;
  errors: RowError[];
  sample: Record<string, unknown>[];
};

export default function NewRosterPage() {
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
      if (!res.ok) throw new Error((await res.json()).error ?? "Preview failed");
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
      if (!res.ok) throw new Error((await res.json()).error ?? "Import failed");
      const data = await res.json();
      router.push(`/admin/rosters/${data.rosterId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Upload player roster</h1>

      <form onSubmit={handlePreview} className="flex flex-col gap-3 mb-6">
        <label className="flex flex-col gap-1 text-sm">
          Roster name
          <input
            required
            value={rosterName}
            onChange={(e) => setRosterName(e.target.value)}
            className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
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
        <button
          type="submit"
          disabled={loading || !file}
          className="mt-2 self-start rounded border border-black/20 dark:border-white/20 px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Parsing…" : "Preview"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

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
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Position</th>
                  <th className="py-2 pr-4">Age</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row, i) => (
                  <tr key={i} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">{String(row.name ?? "")}</td>
                    <td className="py-2 pr-4">{String(row.position ?? "—")}</td>
                    <td className="py-2 pr-4">{String(row.age ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <button
            onClick={handleConfirm}
            disabled={loading || preview.validCount === 0}
            className="self-start rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Importing…" : `Confirm & import ${preview.validCount} players`}
          </button>
        </div>
      )}
    </div>
  );
}
