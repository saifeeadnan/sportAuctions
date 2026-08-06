"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitFantasyTeamAction } from "@/lib/actions/fantasyTeam.actions";
import type { RatedPlayer } from "@/lib/teamStrength";
import { TeamStrengthSummary } from "@/components/manager/TeamStrengthSummary";
import { card, buttonPrimary, tabsTrack, tabItem } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

type PlayerOption = RatedPlayer & {
  id: string;
  name: string;
  categoryName: string;
  status: string;
  price: string;
};

function formatAmount(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function FantasyTeamForm({
  auctionId,
  cap,
  budget,
  players,
  lockedPlayerId,
  initialSelected,
}: {
  auctionId: string;
  cap: number;
  budget: string;
  players: PlayerOption[];
  lockedPlayerId: string;
  initialSelected?: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set([lockedPlayerId, ...(initialSelected ?? [])])
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const budgetTotal = Number(budget);

  const priceByCategory = new Map<string, number>();
  for (const p of players) {
    if (!priceByCategory.has(p.categoryName)) {
      priceByCategory.set(p.categoryName, Number(p.price));
    }
  }
  const categories = Array.from(priceByCategory.keys()).sort(
    (a, b) => (priceByCategory.get(b) ?? 0) - (priceByCategory.get(a) ?? 0)
  );
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] ?? "");

  function toggle(id: string) {
    if (id === lockedPlayerId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= cap) return prev;
        const player = players.find((p) => p.id === id);
        const currentTotal = players
          .filter((p) => next.has(p.id))
          .reduce((sum, p) => sum + Number(p.price), 0);
        if (player && currentTotal + Number(player.price) > budgetTotal) return prev;
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      await submitFantasyTeamAction(auctionId, Array.from(selected));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save fantasy team");
    } finally {
      setLoading(false);
    }
  }

  const totalPrice = players
    .filter((p) => selected.has(p.id))
    .reduce((sum, p) => sum + Number(p.price), 0);
  const budgetRemainingAfterSelection = budgetTotal - totalPrice;

  const visiblePlayers = players.filter((p) => p.categoryName === activeCategory);

  const teamSoFar: RatedPlayer[] = players.filter((p) => selected.has(p.id));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Selected {selected.size}/{cap} (including you) &middot; Total price:{" "}
        {formatAmount(totalPrice)} &middot; Budget remaining after selection:{" "}
        <span className={budgetRemainingAfterSelection < 0 ? "text-red-600 dark:text-red-400" : ""}>
          {formatAmount(budgetRemainingAfterSelection)}
        </span>
      </p>
      <TeamStrengthSummary players={teamSoFar} squadSize={cap} />

      <div className={tabsTrack}>
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
              className={tabItem(activeCategory === cat)}
            >
              {cat} ({selectedInCategory}/{totalInCategory})
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-1.5">
        {visiblePlayers.map((p) => {
          const isLocked = p.id === lockedPlayerId;
          const wouldExceedBudget =
            !selected.has(p.id) && totalPrice + Number(p.price) > budgetTotal;
          return (
            <li key={p.id}>
              <label className={`${card} flex items-center gap-2 text-sm px-3 py-2`}>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  disabled={
                    isLocked || (!selected.has(p.id) && (selected.size >= cap || wouldExceedBudget))
                  }
                />
                <span className="flex-1">
                  {p.name} {p.position ? `(${p.position})` : ""}
                  {isLocked ? " — you (always included)" : ""}
                </span>
                <Badge variant={p.status === "SOLD" ? "success" : "neutral"}>
                  {p.status === "SOLD" ? "Sold" : "Unsold"}
                </Badge>
                <span className="text-black/60 dark:text-white/60">{p.price}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button onClick={handleSubmit} disabled={loading} className={`${buttonPrimary} self-start`}>
        {loading ? "Saving…" : "Save fantasy team"}
      </button>
    </div>
  );
}
