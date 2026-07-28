"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, buttonPrimary } from "@/lib/ui";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export function AddTournamentSponsorForm({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm px-4 pb-4">
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
        <input name="logo" type="file" required accept="image/jpeg,image/png" className={`text-sm ${inputClass}`} />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className={`${buttonPrimary} mt-2 self-start`}>
        {loading ? "Adding…" : "Add sponsor"}
      </button>
    </form>
  );
}
