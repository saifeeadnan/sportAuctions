"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addPlayerToAuctionAction } from "@/lib/actions/auction.actions";
import { buttonPrimary, selectClass } from "@/lib/ui";

type PlayerOption = { id: string; name: string };
type CategoryOption = { id: string; name: string; basePrice: string };

export function AddPlayerToAuctionForm({
  auctionId,
  players,
  categories,
}: {
  auctionId: string;
  players: PlayerOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId || !categoryId) return;
    setLoading(true);
    setError(null);
    const result = await addPlayerToAuctionAction(auctionId, playerId, categoryId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPlayerId("");
    router.refresh();
  }

  if (players.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Every player in this tournament&apos;s roster is already in the auction&apos;s pool.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        Player
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={selectClass}>
          <option value="">Select player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Category
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (base {c.basePrice})
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={loading || !playerId || !categoryId} className={`${buttonPrimary} self-start`}>
        {loading ? "Adding…" : "Add to auction pool"}
      </button>
    </form>
  );
}
