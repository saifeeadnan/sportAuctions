"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAuctionTeamSettingsAction } from "@/lib/actions/auction.actions";
import { inputClass, buttonPrimary } from "@/lib/ui";

export function EditAuctionSquadSizeForm({
  auctionId,
  squadSize,
}: {
  auctionId: string;
  squadSize: number;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState(String(squadSize));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slots.trim()) return;
    setLoading(true);
    setError(null);
    const result = await updateAuctionTeamSettingsAction(auctionId, { newSquadSize: Number(slots) });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        New squad size
        <input
          type="number"
          min={1}
          step="1"
          value={slots}
          onChange={(e) => setSlots(e.target.value)}
          className={inputClass}
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={loading || !slots.trim()} className={`${buttonPrimary} self-start`}>
        {loading ? "Saving…" : "Update squad size"}
      </button>
    </form>
  );
}
