"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseScheduleFile, type ParsedSchedule } from "@/lib/pickleballSchedule/parseScheduleWorkbook";
import { inputClass, buttonPrimary, buttonSecondary, selectClass } from "@/lib/ui";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

/**
 * Pick a schedule workbook (a "Rosters" sheet for Group/Team, a "Schedule"
 * sheet of games grouped into matches — scores are ignored) and match each
 * team name it found to one of this tournament's real teams before
 * submitting. The file is read in this browser tab (see
 * lib/pickleballSchedule/parseScheduleWorkbook.ts for why); the server
 * re-validates the resolved teams/matches independently.
 */
export function UploadPickleballScheduleForm({
  tournamentId,
  eventId,
  teams,
}: {
  tournamentId: string;
  eventId: string;
  teams: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSchedule | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  function reset() {
    setFile(null);
    setParsed(null);
    setMapping({});
    setError(null);
    setInputKey((k) => k + 1);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    setError(null);
    setParsed(null);
    setMapping({});
    setFile(chosen);
    if (!chosen) return;
    setParsing(true);
    try {
      const result = await parseScheduleFile(chosen);
      setParsed(result);
      // Best-effort automatic match by exact (case-insensitive) name — the
      // common case when the workbook's team names already match the app's.
      const initial: Record<string, string> = {};
      for (const t of result.teams) {
        const found = teams.find((real) => real.name.toLowerCase() === t.name.toLowerCase());
        if (found) initial[t.name] = found.id;
      }
      setMapping(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  }

  const unresolved = parsed ? parsed.teams.filter((t) => !mapping[t.name]) : [];
  const chosenTeamIds = Object.values(mapping).filter(Boolean);
  const duplicated = chosenTeamIds.length !== new Set(chosenTeamIds).size;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !parsed) return;
    if (unresolved.length > 0) {
      setError(`Choose a team for: ${unresolved.map((t) => t.name).join(", ")}`);
      return;
    }
    if (duplicated) {
      setError("Two different workbook teams can't be matched to the same team");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const teamsPayload = parsed.teams.map((t) => ({ teamId: mapping[t.name], group: t.group }));
      const matchesPayload = parsed.matches.map((m) => ({
        matchNumber: m.matchNumber,
        round: m.round,
        court: m.court,
        group: m.group,
        team1Id: mapping[m.team1Name],
        team2Id: mapping[m.team2Name],
        gamesToPlay: m.gamesToPlay,
      }));

      const formData = new FormData();
      formData.set("file", file);
      formData.set("teams", JSON.stringify(teamsPayload));
      formData.set("matches", JSON.stringify(matchesPayload));
      const res = await fetch(`/api/tournaments/${tournamentId}/pickleball-events/${eventId}/schedule`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Upload failed"));
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4 max-w-3xl">
      <label className="flex flex-col gap-1 text-sm">
        Excel (.xlsx, .xls) schedule — a &quot;Rosters&quot; sheet (Group, Team) and a &quot;Schedule&quot; sheet (one row per
        game, no scores needed)
        <input key={inputKey} type="file" accept=".xlsx,.xls" onChange={handleFile} className={`text-sm ${inputClass}`} />
      </label>
      {parsing && <p className="text-sm text-black/60 dark:text-white/60">Reading the file…</p>}

      {parsed && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium mb-1">
              Match each workbook team to a real team{" "}
              <span className="font-normal text-black/50 dark:text-white/50">
                — {parsed.teams.length} teams, {parsed.matches.length} matches found
              </span>
            </legend>
            <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5 rounded-lg border border-black/10 dark:border-white/10">
              {parsed.teams.map((t) => (
                <li key={t.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium">{t.name}</span>{" "}
                    <span className="text-xs text-black/50 dark:text-white/50">Group {t.group}</span>
                  </span>
                  <select
                    value={mapping[t.name] ?? ""}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [t.name]: e.target.value }))}
                    className={`${selectClass} text-xs py-1`}
                  >
                    <option value="">— choose a team —</option>
                    {teams.map((real) => (
                      <option key={real.id} value={real.id}>
                        {real.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-black/50 dark:text-white/50">First few matches, as read from the workbook:</p>
            <ul className="flex flex-col gap-1 text-xs text-black/70 dark:text-white/70">
              {parsed.matches.slice(0, 5).map((m) => (
                <li key={m.matchNumber}>
                  Match {m.matchNumber} · Round {m.round} · Group {m.group}
                  {m.court ? ` · ${m.court}` : ""} — {m.team1Name} vs {m.team2Name} ({m.gamesToPlay} game
                  {m.gamesToPlay === 1 ? "" : "s"})
                </li>
              ))}
              {parsed.matches.length > 5 && <li>…and {parsed.matches.length - 5} more</li>}
            </ul>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={uploading || !parsed} className={buttonPrimary}>
          {uploading ? "Uploading…" : "Upload schedule"}
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
