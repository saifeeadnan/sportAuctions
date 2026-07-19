"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminAssignPlayerAction } from "@/lib/actions/bidding.actions";
import { buttonPrimary, inputClass } from "@/lib/ui";

type PlayerOption = { id: string; name: string; categoryName: string; basePrice: string };
type TeamOption = {
  id: string;
  teamName: string;
  budgetRemaining: string;
  slotsFilled: number;
  slotsTotal: number;
};

export function AssignPlayerForm({
  auctionId,
  players,
  teams,
}: {
  auctionId: string;
  players: PlayerOption[];
  teams: TeamOption[];
}) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState("");
  const [teamEntryId, setTeamEntryId] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedPlayer = players.find((p) => p.id === playerId);

  function handlePlayerChange(id: string) {
    setPlayerId(id);
    const player = players.find((p) => p.id === id);
    if (player) setPrice(player.basePrice);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId || !teamEntryId || !price) return;
    setLoading(true);
    setError(null);
    try {
      await adminAssignPlayerAction(auctionId, playerId, teamEntryId, Number(price));
      setPlayerId("");
      setTeamEntryId("");
      setPrice("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign player");
    } finally {
      setLoading(false);
    }
  }

  if (players.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No unassigned players remain.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        Player
        <select
          value={playerId}
          onChange={(e) => handlePlayerChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Select player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.categoryName}, base {p.basePrice})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Team
        <select
          value={teamEntryId}
          onChange={(e) => setTeamEntryId(e.target.value)}
          className={inputClass}
        >
          <option value="">Select team…</option>
          {teams
            .filter((t) => t.slotsFilled < t.slotsTotal)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.teamName} (budget {t.budgetRemaining}, slots {t.slotsFilled}/{t.slotsTotal})
              </option>
            ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Price
        <input
          type="number"
          min={selectedPlayer?.basePrice ?? 1}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={inputClass}
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading || !playerId || !teamEntryId || !price}
        className={`${buttonPrimary} self-start`}
      >
        {loading ? "Assigning…" : "Assign to team"}
      </button>
    </form>
  );
}
