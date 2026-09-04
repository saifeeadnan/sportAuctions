"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { withLeagueParam } from "@/lib/adminNav";
import { inputClass, selectClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

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

export function UploadRosterForm({
  leagues,
  leagueId: fixedLeagueId,
}: {
  /** Non-null only for a site ADMIN with no single league resolved yet —
   * shows a league picker. */
  leagues?: { id: string; name: string; readOnly: boolean }[] | null;
  /** A single already-resolved league — either a League Admin's own (real
   * auth-scoped) league, or a site Admin who's narrowed to one league via
   * the sidebar switcher. That sidebar narrowing is display-only, not part
   * of `requireAdminOrLeagueAdmin`'s actual auth scope (a site Admin's
   * scope is always unrestricted), so the server can't infer it — this
   * must be sent explicitly on every request, same as a real `<select>`. */
  leagueId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rosterName, setRosterName] = useState("");
  const [selectedLeagueId, setSelectedLeagueId] = useState(leagues?.[0]?.id ?? "");
  const effectiveLeagueId = leagues ? selectedLeagueId : fixedLeagueId;
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
      if (effectiveLeagueId) formData.set("leagueId", effectiveLeagueId);
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
      if (effectiveLeagueId) formData.set("leagueId", effectiveLeagueId);
      const res = await fetch("/api/rosters/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Import failed"));
      const data = await res.json();
      router.push(withLeagueParam(`/admin/rosters/${data.rosterId}`, searchParams.get("league")));
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
        {leagues && (
          <label className="flex flex-col gap-1 text-sm">
            League
            <select
              required
              value={selectedLeagueId}
              onChange={(e) => setSelectedLeagueId(e.target.value)}
              className={selectClass}
            >
              {leagues.length === 0 && <option value="">— No leagues yet —</option>}
              {leagues.map((l) => (
                <option key={l.id} value={l.id} disabled={l.readOnly}>
                  {l.name}
                  {l.readOnly ? " (read-only)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-xs">
          {effectiveLeagueId ? (
            <a href={`/api/rosters/template.csv?leagueId=${effectiveLeagueId}`} className="underline">
              Download template
            </a>
          ) : (
            <span className="text-black/40 dark:text-white/40">Download template</span>
          )}
          <span className="text-black/50 dark:text-white/50">
            {" "}
            — fields marked * are required for this league.
          </span>
        </p>
        <label className="flex flex-col gap-1 text-sm">
          CSV file
          <input
            required
            type="file"
            accept=".csv"
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
                    <th className="py-2 pr-4 whitespace-nowrap">Email</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Phone</th>
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
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.email ?? "—")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{String(row.phone ?? "—")}</td>
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
