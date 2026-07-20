"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AuctionState } from "@/lib/services/auctionState.service";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { TeamBudgetBoard } from "@/components/auction/TeamBudgetBoard";
import { SoldTicker } from "@/components/auction/SoldTicker";
import { OnClockCard } from "@/components/auction/OnClockCard";
import { SaleAnnouncement } from "@/components/auction/SaleAnnouncement";
import {
  selectNextPlayerAction,
  recordSaleAction,
  markUnsoldAction,
  concludeAuctionAction,
  removePlayerFromTeamAction,
} from "@/lib/actions/bidding.actions";
import { resetAuctionAction } from "@/lib/actions/auction.actions";
import { card, cardInteractive, buttonPrimary, buttonSecondary, buttonDanger, inputClass, tabsTrack, tabItem } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

// "Abdulqadir Zumkhawala" -> "Abdulqadir Z." — keeps allocation columns compact.
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${first} ${lastInitial}.`;
}

export function AuctioneerConsole({ initialState }: { initialState: AuctionState }) {
  const router = useRouter();
  const { state, connected, lastSale } = useAuctionSocket(initialState.id, initialState);
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

  const categoryBasePrices = new Map<string, number>();
  for (const p of state.players) {
    if (!categoryBasePrices.has(p.categoryName)) {
      categoryBasePrices.set(p.categoryName, Number(p.basePrice));
    }
  }
  const categories = Array.from(categoryBasePrices.keys()).sort(
    (a, b) => (categoryBasePrices.get(b) ?? 0) - (categoryBasePrices.get(a) ?? 0)
  );
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

  async function handleRemove(auctionPlayerId: string, playerName: string, teamName: string | null) {
    if (
      !window.confirm(
        `Remove ${playerName} from ${teamName ?? "their team"} and return them to the pool? The team's budget and slot will be refunded.`
      )
    )
      return;
    setLoading(true);
    setError(null);
    try {
      await removePlayerFromTeamAction(state.id, auctionPlayerId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove player");
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
        <Link href={`/admin/auctions/${state.id}`} className={`${buttonSecondary} self-start`}>
          Go to auction admin page
        </Link>
      </div>
    );
  }

  const soldPlayers = state.players.filter((p) => p.status === "SOLD");

  return (
    <div className="flex flex-col gap-6">
      <SaleAnnouncement sale={lastSale} />
      <div className="flex items-center gap-2 text-xs">
        <Badge variant={connected ? "success" : "warning"}>{connected ? "Live" : "Connecting…"}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className={`${card} px-4 py-3`}>
          <p className="text-xs text-black/50 dark:text-white/50 mb-1">Sold</p>
          <p className="text-2xl font-semibold">{soldCount}</p>
        </div>
        <div className={`${card} px-4 py-3`}>
          <p className="text-xs text-black/50 dark:text-white/50 mb-1">Remaining</p>
          <p className="text-2xl font-semibold">{queue.length}</p>
        </div>
        <div className={`${card} px-4 py-3`}>
          <p className="text-xs text-black/50 dark:text-white/50 mb-1">Teams with room</p>
          <p className="text-2xl font-semibold">
            {teamsWithRoom}/{state.teams.length}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Remaining pool ({queue.length})</h2>
            <button
              type="button"
              onClick={handleRandomPick}
              disabled={!!onClock || queue.length === 0}
              className={`${buttonSecondary} px-3 py-1.5 text-xs`}
            >
              Random pick
            </button>
          </div>

          <div className={`${tabsTrack} mb-3`}>
            {categories.map((cat) => {
              const count = queue.filter((p) => p.categoryName === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={tabItem(activeCategory === cat)}
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
            <ul className="flex flex-col gap-1.5">
              {visibleQueue.map((p) => (
                <li
                  key={p.id}
                  className={`${cardInteractive} flex items-center justify-between px-3 py-2 text-sm`}
                >
                  <span className="flex items-center gap-2">
                    {p.name}
                    {p.status === "IN_PRE_AUCTION_POOL" && <Badge variant="warning">Contested</Badge>}
                    {p.status === "UNSOLD" && <Badge variant="neutral">Re-offer</Badge>}
                  </span>
                  <button
                    onClick={() => handleSelect(p.id)}
                    disabled={!!onClock}
                    className={`${buttonSecondary} px-2 py-1 text-xs`}
                  >
                    Put on clock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} p-4`}>
          <h2 className="text-lg font-medium mb-3">On the clock</h2>
          <div className="flex flex-col gap-3 items-center">
            <OnClockCard player={onClock} photoWidth={200} photoHeight={300} />
            {onClock && (
              <div className="flex flex-col gap-3 w-full max-w-sm">
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className={inputClass}
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
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleRecordSale}
                    disabled={loading || !selectedTeamId || !price}
                    className={buttonPrimary}
                  >
                    Record sale
                  </button>
                  <button onClick={handleUnsold} disabled={loading} className={buttonSecondary}>
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

      <details className={card}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Team allocations ({soldPlayers.length})
        </summary>
        <div className="px-4 pb-4">
          {soldPlayers.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">No players allocated yet.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto">
              {state.teams.map((team) => {
                const teamPlayers = soldPlayers
                  .filter((p) => p.soldToEntryId === team.id)
                  .sort((a, b) => a.name.localeCompare(b.name));
                return (
                  <div
                    key={team.id}
                    className="flex-1 min-w-[200px] rounded-lg border border-black/[0.06] dark:border-white/10 p-3"
                  >
                    <p className="text-sm font-medium mb-2">
                      {team.teamName}{" "}
                      <span className="text-black/50 dark:text-white/50">
                        ({teamPlayers.length})
                      </span>
                    </p>
                    {teamPlayers.length === 0 ? (
                      <p className="text-xs text-black/50 dark:text-white/50">No players yet.</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {teamPlayers.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate" title={p.name}>
                              {shortName(p.name)}{" "}
                              <span className="text-black/50 dark:text-white/50">
                                ({p.soldPrice})
                              </span>
                            </span>
                            <button
                              onClick={() => handleRemove(p.id, p.name, p.soldToTeamName)}
                              disabled={loading}
                              aria-label={`Remove ${p.name} and return to pool`}
                              title="Remove from team and return to pool"
                              className={`${buttonDanger} p-1 shrink-0`}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                className="h-3.5 w-3.5"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </details>

      <div className="flex gap-3">
        <button onClick={handleConclude} disabled={loading} className={buttonDanger}>
          Conclude auction
        </button>
        <button onClick={handleReset} disabled={loading} className={buttonSecondary}>
          Reset auction
        </button>
      </div>
    </div>
  );
}
