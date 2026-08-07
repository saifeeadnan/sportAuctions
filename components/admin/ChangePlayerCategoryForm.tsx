"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAuctionPlayerCategoryAction } from "@/lib/actions/auction.actions";
import { buttonPrimary, selectClass } from "@/lib/ui";

type PlayerOption = { id: string; name: string; categoryName: string };
type CategoryOption = { id: string; name: string; basePrice: string };

export function ChangePlayerCategoryForm({
  auctionId,
  players,
  categories,
}: {
  auctionId: string;
  players: PlayerOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [auctionPlayerId, setAuctionPlayerId] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auctionPlayerId || !categoryId) return;
    setLoading(true);
    setError(null);
    try {
      await updateAuctionPlayerCategoryAction(auctionId, auctionPlayerId, categoryId);
      setAuctionPlayerId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change category");
    } finally {
      setLoading(false);
    }
  }

  if (players.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        No players are eligible to move — a category can only be changed before a player is sold
        or on the clock.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        Player
        <select
          value={auctionPlayerId}
          onChange={(e) => setAuctionPlayerId(e.target.value)}
          className={selectClass}
        >
          <option value="">Select player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (currently {p.categoryName})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        New category
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (base {c.basePrice})
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading || !auctionPlayerId || !categoryId}
        className={`${buttonPrimary} self-start`}
      >
        {loading ? "Moving…" : "Move to category"}
      </button>
    </form>
  );
}
