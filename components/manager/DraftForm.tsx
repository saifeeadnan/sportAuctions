"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitDraftAction } from "@/lib/actions/auction.actions";
import type { RatedPlayer } from "@/lib/teamStrength";
import { TeamStrengthSummary } from "@/components/manager/TeamStrengthSummary";

type PlayerOption = RatedPlayer & {
  id: string;
  name: string;
  categoryName: string;
  basePrice: string;
};

function formatAmount(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function DraftForm({
  entryId,
  cap,
  budgetRemaining,
  confirmedPlayers,
  players,
  initialSelected,
  lockedPlayerId,
}: {
  entryId: string;
  cap: number;
  budgetRemaining: string;
  confirmedPlayers: RatedPlayer[];
  players: PlayerOption[];
  initialSelected: string[];
  lockedPlayerId?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(lockedPlayerId ? [...initialSelected, lockedPlayerId] : initialSelected)
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const budget = Number(budgetRemaining);

  const categories = Array.from(new Set(players.map((p) => p.categoryName)));
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] ?? "");

  function toggle(id: string) {
    if (id === lockedPlayerId) return;
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= cap) return prev;
        const player = players.find((p) => p.id === id);
        const currentTotal = players
          .filter((p) => next.has(p.id))
          .reduce((sum, p) => sum + Number(p.basePrice), 0);
        if (player && currentTotal + Number(player.basePrice) > budget) return prev;
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      await submitDraftAction(entryId, Array.from(selected));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit draft");
    } finally {
      setLoading(false);
    }
  }

  const totalBasePrice = players
    .filter((p) => selected.has(p.id))
    .reduce((sum, p) => sum + Number(p.basePrice), 0);
  const budgetRemainingAfterSelection = budget - totalBasePrice;

  const visiblePlayers = players.filter((p) => p.categoryName === activeCategory);

  const teamSoFar: RatedPlayer[] = [
    ...confirmedPlayers,
    ...players.filter((p) => selected.has(p.id)),
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Selected {selected.size}/{cap} &middot; Total base price: {formatAmount(totalBasePrice)}{" "}
        &middot; Budget remaining after selection:{" "}
        <span className={budgetRemainingAfterSelection < 0 ? "text-red-600" : ""}>
          {formatAmount(budgetRemainingAfterSelection)}
        </span>
      </p>
      <TeamStrengthSummary players={teamSoFar} />

      <div className="flex gap-1 border-b border-black/10 dark:border-white/10">
        {categories.map((cat) => {
          const selectedInCategory = players.filter(
            (p) => p.categoryName === cat && selected.has(p.id)
          ).length;
          const totalInCategory = players.filter((p) => p.categoryName === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                activeCategory === cat
                  ? "border-black dark:border-white font-medium"
                  : "border-transparent text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
              }`}
            >
              {cat} ({selectedInCategory}/{totalInCategory})
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-1">
        {visiblePlayers.map((p) => {
          const isLocked = p.id === lockedPlayerId;
          const wouldExceedBudget =
            !selected.has(p.id) && totalBasePrice + Number(p.basePrice) > budget;
          return (
            <li key={p.id}>
              <label className="flex items-center gap-2 text-sm rounded border border-black/10 dark:border-white/10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  disabled={
                    isLocked ||
                    (!selected.has(p.id) && (selected.size >= cap || wouldExceedBudget))
                  }
                />
                <span className="flex-1">
                  {p.name} {p.position ? `(${p.position})` : ""}
                  {isLocked ? " — you (locked in)" : ""}
                </span>
                <span className="text-black/60 dark:text-white/60">base {p.basePrice}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Draft submitted.</p>}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="self-start rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Submitting…" : "Submit draft"}
      </button>
    </div>
  );
}
