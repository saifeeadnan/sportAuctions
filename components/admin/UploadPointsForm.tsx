"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

type RowError = { rowNumber: number; message: string };
type PreviewResult = {
  validCount: number;
  errors: RowError[];
  sample: { name?: string; loginId?: string; points: number }[];
};
type CommitResult = {
  updatedCount: number;
  unmatched: RowError[];
  parseErrorCount: number;
};

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export function UploadPointsForm({ auctionId }: { auctionId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("mode", "preview");
      const res = await fetch(`/api/auctions/${auctionId}/points/upload`, {
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
      formData.set("mode", "commit");
      const res = await fetch(`/api/auctions/${auctionId}/points/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Upload failed"));
      setResult(await res.json());
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <form onSubmit={handlePreview} className="flex flex-col gap-3 max-w-xl">
        <label className="flex flex-col gap-1 text-sm">
          Points file (columns: Player or Login ID, and Points)
          <input
            required
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
            }}
            className={`text-sm ${inputClass}`}
          />
        </label>
        <button type="submit" disabled={loading || !file} className={`${buttonSecondary} self-start`}>
          {loading ? "Parsing…" : "Preview"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {preview && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {preview.validCount} valid row(s) found
            {preview.errors.length > 0 && `, ${preview.errors.length} row(s) skipped due to errors`}
            .
          </p>

          {preview.errors.length > 0 && (
            <ul className="text-sm text-red-600 dark:text-red-400 flex flex-col gap-1">
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
                    <th className="py-2 pr-4 whitespace-nowrap">Player</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Login ID</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((row, i) => (
                    <tr key={i} className="border-b border-black/5 dark:border-white/5">
                      <td className="py-2 pr-4 whitespace-nowrap">{row.name ?? "—"}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{row.loginId ?? "—"}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{row.points}</td>
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
            {loading ? "Uploading…" : `Confirm & apply ${preview.validCount} row(s)`}
          </button>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Updated points for {result.updatedCount} player(s).
          </p>
          {result.unmatched.length > 0 && (
            <>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {result.unmatched.length} row(s) didn&apos;t match any player in this auction:
              </p>
              <ul className="text-sm text-black/60 dark:text-white/60 flex flex-col gap-1">
                {result.unmatched.map((err, i) => (
                  <li key={i}>
                    Row {err.rowNumber}: {err.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
