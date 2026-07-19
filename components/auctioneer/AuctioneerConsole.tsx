"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AuctionState } from "@/lib/services/auctionState.service";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { TeamBudgetBoard } from "@/components/auction/TeamBudgetBoard";
import { SoldTicker } from "@/components/auction/SoldTicker";
import { OnClockCard } from "@/components/auction/OnClockCard";
import {
  selectNextPlayerAction,
  recordSaleAction,
  markUnsoldAction,
  concludeAuctionAction,
} from "@/lib/actions/bidding.actions";
import { resetAuctionAction } from "@/lib/actions/auction.actions";

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
  const soldCount = state.players.filter((p) => p.status === "SOLD").length;
  const teamsWithRoom = state.teams.filter((t) => t.slotsFilled < t.slotsTotal).length;

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

  function pickFromHighestCategory(pool: typeof queue): { id: string; categoryName: string } | null {
    // Highest base-price category first; once it's exhausted, move to the next.
    const basePriceByCategory = new Map<string, number>();
    for (const p of pool) {
      if (!basePriceByCategory.has(p.categoryName)) {
        basePriceByCategory.set(p.categoryName, Number(p.basePrice));
      }
    }
    const orderedCategories = Array.from(basePriceByCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    for (const cat of orderedCategories) {
      const candidates = pool.filter((p) => p.categoryName === cat);
      if (candidates.length === 0) continue;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return null;
  }

  // Max bid a team can legally place on the player currently on the clock, without
  // leaving itself unable to fill its remaining squad slots. Reserves the cheapest
  // players actually left in the pool (excluding the one on the clock) for the
  // slots that still need filling after this pick, rather than assuming a flat
  // per-slot minimum — a category can dry up before a team's slots do.
  const remainingPoolBasePrices = onClock
    ? queue.filter((p) => p.id !== onClock.id).map((p) => Number(p.basePrice))
    : [];

  function computeMaxBid(budgetRemaining: number, slotsRemaining: number): number {
    if (slotsRemaining <= 0) return 0;
    const slotsAfterThisPick = slotsRemaining - 1;
    if (slotsAfterThisPick <= 0) return budgetRemaining;
    const reserve = [...remainingPoolBasePrices]
      .sort((a, b) => a - b)
      .slice(0, slotsAfterThisPick)
      .reduce((sum, p) => sum + p, 0);
    return budgetRemaining - reserve;
  }

  const maxBids: Record<string, string> | undefined = onClock
    ? Object.fromEntries(
        state.teams.map((t) => {
          const maxBid = computeMaxBid(
            Number(t.budgetRemaining),
            t.slotsTotal - t.slotsFilled
          );
          return [t.id, maxBid < Number(onClock.basePrice) ? "Cannot bid" : String(maxBid)];
        })
      )
    : undefined;

  function handleRandomPick() {
    // Previously-unsold (re-offer) players are only picked once every fresh/contested
    // player has already been put on the clock at least once this auction.
    const freshPool = queue.filter((p) => p.status !== "UNSOLD");
    const unsoldPool = queue.filter((p) => p.status === "UNSOLD");
    const pick = pickFromHighestCategory(freshPool) ?? pickFromHighestCategory(unsoldPool);
    if (!pick) return;
    setActiveCategory(pick.categoryName);
    handleSelect(pick.id);
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

  async function handleReset() {
    if (
      !window.confirm(
        "Reset this auction back to before bidding started? This undoes every live-bid sale made so far (players un-sold, team budgets and slots refunded) and any unsold/on-the-clock status. Pre-auction draft and admin-assigned players are not affected."
      )
    )
      return;
    setLoading(true);
    setError(null);
    try {
      await resetAuctionAction(state.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset auction");
    } finally {
      setLoading(false);
    }
  }

  if (state.status === "COMPLETED") {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-lg font-medium">Auction completed.</p>
        <TeamBudgetBoard teams={state.teams} showStatus={false} />
        <SoldTicker players={state.players} teams={state.teams} />
      </div>
    );
  }

  if (state.status !== "BIDDING") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-black/60 dark:text-white/60">
          This auction is currently in status <strong>{state.status}</strong>, not bidding.
        </p>
        <Link
          href={`/admin/auctions/${state.id}`}
          className="text-sm underline underline-offset-2 self-start"
        >
          Go to auction admin page
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded border border-black/20 dark:border-white/20 px-4 py-3">
        <p className="text-xs text-black/50 dark:text-white/50 mb-1">
          {connected ? "Live" : "Connecting…"}
        </p>
        <p className="text-sm">
          Sold: {soldCount} &middot; Remaining: {queue.length} &middot; Teams with room:{" "}
          {teamsWithRoom}/{state.teams.length}
        </p>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Remaining pool ({queue.length})</h2>
            <button
              type="button"
              onClick={handleRandomPick}
              disabled={!!onClock || queue.length === 0}
              className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Random pick
            </button>
          </div>

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
                    {p.name}
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
          <h2 className="text-lg font-medium mb-3">On the clock</h2>
          <div className="flex flex-col gap-3 items-center">
            <OnClockCard player={onClock} photoWidth={200} photoHeight={300} />
            {onClock && (
              <div className="flex flex-col gap-3 w-full max-w-sm">
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
          </div>
        </section>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Teams</h2>
        <TeamBudgetBoard teams={state.teams} maxBids={maxBids} showStatus={false} />
      </section>

      <details className="rounded border border-black/10 dark:border-white/10">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Sold / unsold history
        </summary>
        <div className="px-4 pb-4">
          <SoldTicker players={state.players} teams={state.teams} />
        </div>
      </details>

      <div className="flex gap-3">
        <button
          onClick={handleConclude}
          disabled={loading}
          className="self-start rounded border border-red-600 text-red-600 px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          Conclude auction
        </button>
        <button
          onClick={handleReset}
          disabled={loading}
          className="self-start rounded border border-black/20 dark:border-white/20 px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          Reset auction
        </button>
      </div>
    </div>
  );
}
