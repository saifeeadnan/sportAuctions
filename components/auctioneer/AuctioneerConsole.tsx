"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuctionState } from "@/lib/services/auctionState.service";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { TeamBudgetBoard } from "@/components/auction/TeamBudgetBoard";
import { SoldTicker } from "@/components/auction/SoldTicker";
import {
  selectNextPlayerAction,
  recordSaleAction,
  markUnsoldAction,
  concludeAuctionAction,
} from "@/lib/actions/bidding.actions";

export function AuctioneerConsole({ initialState }: { initialState: AuctionState }) {
  const router = useRouter();
  const { state, connected } = useAuctionSocket(initialState.id, initialState);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onClock = state.players.find((p) => p.status === "IN_BIDDING");
  const queue = state.players.filter(
    (p) =>
      p.status === "AVAILABLE" || p.status === "IN_PRE_AUCTION_POOL" || p.status === "UNSOLD"
  );

  const categories = Array.from(new Set(state.players.map((p) => p.categoryName))).sort();
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] ?? "");
  const visibleQueue = queue.filter((p) => p.categoryName === activeCategory);

  async function handleSelect(playerId: string) {
    setError(null);
    try {
      await selectNextPlayerAction(state.id, playerId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select player");
    }
  }

  async function handleRecordSale() {
    if (!onClock || !selectedTeamId || !price) return;
    setLoading(true);
    setError(null);
    try {
      await recordSaleAction(state.id, onClock.id, selectedTeamId, Number(price));
      setSelectedTeamId("");
      setPrice("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record sale");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsold() {
    if (!onClock) return;
    setLoading(true);
    setError(null);
    try {
      await markUnsoldAction(state.id, onClock.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark unsold");
    } finally {
      setLoading(false);
    }
  }

  async function handleConclude() {
    if (!window.confirm("Conclude this auction? Remaining players will be marked unsold.")) return;
    setLoading(true);
    setError(null);
    try {
      await concludeAuctionAction(state.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to conclude auction");
    } finally {
      setLoading(false);
    }
  }

  if (state.status === "COMPLETED") {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-lg font-medium">Auction completed.</p>
        <TeamBudgetBoard teams={state.teams} />
        <SoldTicker players={state.players} teams={state.teams} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-black/50 dark:text-white/50">
        {connected ? "Live" : "Connecting…"}
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="text-lg font-medium mb-3">On the clock</h2>
        {!onClock ? (
          <p className="text-black/60 dark:text-white/60">No player is currently on the clock.</p>
        ) : (
          <div className="flex flex-col gap-3 max-w-sm">
            <p className="text-xl font-semibold">{onClock.name}</p>
            <p className="text-sm text-black/60 dark:text-white/60">
              {onClock.categoryName} &middot; base price {onClock.basePrice}
            </p>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            >
              <option value="">Select winning team…</option>
              {state.teams
                .filter((t) => t.slotsFilled < t.slotsTotal)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.teamName} (budget {t.budgetRemaining})
                  </option>
                ))}
            </select>
            <input
              type="number"
              min={onClock.basePrice}
              step="0.01"
              placeholder={`Winning price (min ${onClock.basePrice})`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            />
            <div className="flex gap-2">
              <button
                onClick={handleRecordSale}
                disabled={loading || !selectedTeamId || !price}
                className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Record sale
              </button>
              <button
                onClick={handleUnsold}
                disabled={loading}
                className="rounded border border-black/20 dark:border-white/20 px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Mark unsold
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Remaining pool ({queue.length})</h2>

        <div className="flex gap-1 border-b border-black/10 dark:border-white/10 mb-3">
          {categories.map((cat) => {
            const count = queue.filter((p) => p.categoryName === cat).length;
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
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {visibleQueue.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No remaining players in this category.
          </p>
        ) : (
        <ul className="flex flex-col gap-1">
          {visibleQueue.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded border border-black/10 dark:border-white/10 px-3 py-2 text-sm"
            >
              <span>
                {p.name} &middot; {p.categoryName} &middot; base {p.basePrice}
                {p.status === "IN_PRE_AUCTION_POOL" ? " (contested)" : ""}
                {p.status === "UNSOLD" ? " (unsold — re-offer)" : ""}
              </span>
              <button
                onClick={() => handleSelect(p.id)}
                disabled={!!onClock}
                className="rounded border border-black/20 dark:border-white/20 px-2 py-1 text-xs disabled:opacity-50"
              >
                Put on clock
              </button>
            </li>
          ))}
        </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Teams</h2>
        <TeamBudgetBoard teams={state.teams} />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Sold / unsold</h2>
        <SoldTicker players={state.players} teams={state.teams} />
      </section>

      <button
        onClick={handleConclude}
        disabled={loading}
        className="self-start rounded border border-red-600 text-red-600 px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        Conclude auction
      </button>
    </div>
  );
}
