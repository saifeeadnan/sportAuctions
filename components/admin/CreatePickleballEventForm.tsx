"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPickleballEventAction } from "@/lib/actions/pickleballEvent.actions";
import { buttonPrimary, selectClass } from "@/lib/ui";

/** One tournament's "start a pickleball event" control: pick the completed
 * auction whose results become every team's roster, then create. */
export function CreatePickleballEventForm({
  tournamentId,
  completedAuctions,
}: {
  tournamentId: string;
  completedAuctions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [auctionId, setAuctionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auctionId) return;
    setBusy(true);
    setError(null);
    const result = await createPickleballEventAction(tournamentId, auctionId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    // TS can't statically rule out an empty-string `error` on the other
    // branch from a plain truthiness check, so `.data` reads as possibly
    // undefined here even though the check above guarantees it (same
    // reasoning as tournament.actions.ts's createTournamentAction).
    router.push(`/admin/pickleball/${result.data!.id}`);
  }

  if (completedAuctions.length === 0) {
    return (
      <p className="text-xs text-black/50 dark:text-white/50">
        No completed auction yet — a pickleball event&apos;s rosters come from one.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <select value={auctionId} onChange={(e) => setAuctionId(e.target.value)} className={`${selectClass} text-xs py-1`}>
        <option value="">Choose the drafting auction…</option>
        {completedAuctions.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={busy || !auctionId} className={`${buttonPrimary} px-2 py-1 text-xs`}>
        {busy ? "Creating…" : "Create pickleball event"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </form>
  );
}
