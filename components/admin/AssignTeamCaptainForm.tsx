"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignTeamCaptainAction } from "@/lib/actions/teamCaptain.actions";
import { selectClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

export function AssignTeamCaptainForm({
  auctionId,
  teamAuctionEntryId,
  currentCaptainAuctionPlayerId,
  players,
}: {
  auctionId: string;
  teamAuctionEntryId: string;
  currentCaptainAuctionPlayerId: string | null;
  players: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentCaptainAuctionPlayerId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (players.length === 0) return null;

  const currentCaptainName = players.find((p) => p.id === currentCaptainAuctionPlayerId)?.name;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
      >
        {currentCaptainName ? `Captain: ${currentCaptainName} (change)` : "No captain (assign)"}
      </button>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await assignTeamCaptainAction(auctionId, teamAuctionEntryId, value || null);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={value} onChange={(e) => setValue(e.target.value)} className={`${selectClass} py-1 text-xs`}>
          <option value="">— None —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={loading}
          onClick={handleSave}
          className={`${buttonPrimary} px-2 py-1 text-xs`}
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(currentCaptainAuctionPlayerId ?? "");
            setOpen(false);
          }}
          className={`${buttonSecondary} px-2 py-1 text-xs`}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
