"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, selectClass, buttonPrimary, tabsTrack, tabItem } from "@/lib/ui";

type KnownSponsor = { id: string; name: string; websiteUrl: string | null };

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export function AddTournamentSponsorForm({
  tournamentId,
  knownSponsors,
}: {
  tournamentId: string;
  knownSponsors: KnownSponsor[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "upload">(
    knownSponsors.length > 0 ? "existing" : "upload"
  );
  const [selectedSponsorId, setSelectedSponsorId] = useState(knownSponsors[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUploadSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // React nulls out e.currentTarget once the synchronous part of the
    // handler finishes, so it must be captured before the first `await`.
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData(form);
      const res = await fetch(`/api/tournaments/${tournamentId}/sponsors`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to add sponsor"));
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add sponsor");
    } finally {
      setLoading(false);
    }
  }

  async function handleExistingSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/sponsors/existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSponsorId: selectedSponsorId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to add sponsor"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add sponsor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-sm px-4 pb-4">
      {knownSponsors.length > 0 && (
        <div className={tabsTrack}>
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={tabItem(mode === "existing")}
          >
            Choose existing
          </button>
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={tabItem(mode === "upload")}
          >
            Upload new
          </button>
        </div>
      )}

      {mode === "existing" && knownSponsors.length > 0 ? (
        <form onSubmit={handleExistingSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Sponsor
            <select
              value={selectedSponsorId}
              onChange={(e) => setSelectedSponsorId(e.target.value)}
              className={selectClass}
            >
              {knownSponsors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className={`${buttonPrimary} mt-2 self-start`}>
            {loading ? "Adding…" : "Add sponsor"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleUploadSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Sponsor name
            <input name="name" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Website (optional)
            <input name="websiteUrl" type="text" placeholder="example.com" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Logo (JPG or PNG)
            <input
              name="logo"
              type="file"
              required
              accept="image/jpeg,image/png"
              className={`text-sm ${inputClass}`}
            />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className={`${buttonPrimary} mt-2 self-start`}>
            {loading ? "Adding…" : "Add sponsor"}
          </button>
        </form>
      )}
    </div>
  );
}
