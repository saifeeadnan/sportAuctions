"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, selectClass, buttonPrimary } from "@/lib/ui";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export function AddTeamForm({
  tournamentId,
  managers,
}: {
  tournamentId: string;
  managers: { id: string; name: string; loginId: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // React nulls out e.currentTarget once the synchronous part of the handler
    // finishes, so it must be captured before the first `await`.
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData(form);
      const res = await fetch(`/api/tournaments/${tournamentId}/teams`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to add team"));
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add team");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm px-4 pb-4">
      <label className="flex flex-col gap-1 text-sm">
        Team name
        <input name="name" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Manager
        <select name="managerId" className={selectClass}>
          <option value="">— None yet —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.loginId})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Sponsor picture (JPG or PNG, optional)
        <input name="sponsorImage" type="file" accept="image/jpeg,image/png" className={`text-sm ${inputClass}`} />
      </label>
      <input type="hidden" name="managerOccupiesSlot" value="off" />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className={`${buttonPrimary} mt-2 self-start`}>
        {loading ? "Adding…" : "Add team"}
      </button>
    </form>
  );
}
