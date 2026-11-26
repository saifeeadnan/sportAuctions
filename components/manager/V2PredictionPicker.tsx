"use client";

import { useState } from "react";
import { savePredictionAction, removePredictionAction } from "@/lib/actions/auctionPrediction.actions";
import { card, selectClass, inputClass, tabsTrack, tabItem } from "@/lib/ui";
import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/services/auctionState.service";
import type { PlayerPrediction } from "@/lib/auction/projectedStandings";

/**
 * v2's own "who wins each remaining player?" picker — a separate component
 * from v1's PredictionPicker (own table-based markup, matching v2's other
 * panels), kept deliberately independent at the UI layer. It still reads and
 * writes the same AuctionPlayerPrediction rows via the same server actions,
 * since the Simulate tab's engine already consumes that data as a shared
 * input regardless of which dashboard set it.
 */
export function V2PredictionPicker({
  entryId,
  players,
  otherTeams,
  predictions,
  onPredictionChange,
}: {
  entryId: string;
  players: AuctionStatePlayer[];
  otherTeams: AuctionStateTeam[];
  predictions: Record<string, PlayerPrediction>;
  onPredictionChange: (auctionPlayerId: string, prediction: PlayerPrediction | null) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [minAmountDrafts, setMinAmountDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categories = Array.from(new Set(players.map((p) => p.categoryName)));
  const effectiveCategory =
    activeCategory && categories.includes(activeCategory) ? activeCategory : (categories[0] ?? null);

  // A team, a max amount, and a min amount are all independent of each
  // other — any can be set without the others. "Unsold" is different: it's
  // mutually exclusive with all three (predicting nobody wins this player
  // at all, rather than predicting who does and for how much), so setting
  // it always clears the other three, and setting any of the other three
  // always clears it. Only when all four end up empty/false is there
  // nothing left to represent, so that's the one case that removes the row
  // entirely.
  async function persistPrediction(
    auctionPlayerId: string,
    teamIdOrEmpty: string,
    amount: number | null,
    minAmount: number | null,
    unsold: boolean
  ) {
    const teamId = teamIdOrEmpty === "" ? null : teamIdOrEmpty;
    setPending(auctionPlayerId);
    setErrors((prev) => ({ ...prev, [auctionPlayerId]: "" }));
    if (teamId == null && amount == null && minAmount == null && !unsold) {
      const result = await removePredictionAction(entryId, auctionPlayerId);
      if (result.error) {
        setErrors((prev) => ({ ...prev, [auctionPlayerId]: result.error }));
      } else {
        onPredictionChange(auctionPlayerId, null);
      }
    } else {
      const result = await savePredictionAction(entryId, auctionPlayerId, teamId, amount, minAmount, unsold);
      if (result.error) {
        setErrors((prev) => ({ ...prev, [auctionPlayerId]: result.error }));
      } else {
        onPredictionChange(auctionPlayerId, { teamId, amount, minAmount, unsold });
      }
    }
    setPending(null);
  }

  async function handleTeamChange(auctionPlayerId: string, teamIdOrEmpty: string) {
    const existing = predictions[auctionPlayerId];
    await persistPrediction(auctionPlayerId, teamIdOrEmpty, existing?.amount ?? null, existing?.minAmount ?? null, false);
  }

  async function handleUnsoldToggle(auctionPlayerId: string) {
    const alreadyUnsold = predictions[auctionPlayerId]?.unsold ?? false;
    // Toggling on clears any team/amount/min that might somehow be present;
    // toggling off just clears the flag (team/amount/min were never
    // reachable while it was on, so there's nothing to restore).
    await persistPrediction(auctionPlayerId, "", null, null, !alreadyUnsold);
  }

  function parseAmountBlur(
    auctionPlayerId: string,
    label: string,
    rawValue: string,
    floor?: number
  ): number | null | undefined {
    const trimmed = rawValue.trim();
    const amount = trimmed === "" ? null : Number(trimmed);
    if (amount != null && (Number.isNaN(amount) || amount <= 0)) {
      setErrors((prev) => ({ ...prev, [auctionPlayerId]: `${label} must be a number greater than 0` }));
      return undefined;
    }
    if (amount != null && floor != null && amount < floor) {
      setErrors((prev) => ({ ...prev, [auctionPlayerId]: `${label} can't be below the base price (${floor})` }));
      return undefined;
    }
    return amount;
  }

  async function handleAmountBlur(auctionPlayerId: string, teamIdOrEmpty: string, rawValue: string) {
    const amount = parseAmountBlur(auctionPlayerId, "Amount", rawValue);
    if (amount === undefined) return;
    const existingMinAmount = predictions[auctionPlayerId]?.minAmount ?? null;
    await persistPrediction(auctionPlayerId, teamIdOrEmpty, amount, existingMinAmount, false);
  }

  async function handleMinAmountBlur(auctionPlayerId: string, teamIdOrEmpty: string, rawValue: string, basePrice: number) {
    const minAmount = parseAmountBlur(auctionPlayerId, "Min amount", rawValue, basePrice);
    if (minAmount === undefined) return;
    const existingAmount = predictions[auctionPlayerId]?.amount ?? null;
    await persistPrediction(auctionPlayerId, teamIdOrEmpty, existingAmount, minAmount, false);
  }

  const visiblePlayers = players.filter((p) => p.categoryName === effectiveCategory);

  return (
    <div className="flex flex-col gap-3">
      {categories.length > 0 && (
        <div className={tabsTrack}>
          {categories.map((cat) => {
            const predictedInCategory = players.filter((p) => p.categoryName === cat && predictions[p.id]).length;
            const totalInCategory = players.filter((p) => p.categoryName === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={tabItem(effectiveCategory === cat)}
              >
                {cat} ({predictedInCategory}/{totalInCategory})
              </button>
            );
          })}
        </div>
      )}

      <div className={card}>
        <div className="hidden md:grid grid-cols-[1fr_180px_90px_90px_80px] gap-3 px-4 py-2 text-xs text-black/60 dark:text-white/60 border-b border-black/10 dark:border-white/10">
          <span>Player</span>
          <span>Predicted winner</span>
          <span className="text-right">Min amount</span>
          <span className="text-right">Max amount</span>
          <span className="text-center">Unsold</span>
        </div>
        {visiblePlayers.length === 0 ? (
          <p className="py-3 px-4 text-sm text-black/50 dark:text-white/50">No players left to predict.</p>
        ) : (
          <ul className="flex flex-col">
            {visiblePlayers.map((p) => {
              const prediction = predictions[p.id];
              const teamId = prediction?.teamId ?? "";
              const isUnsold = prediction?.unsold ?? false;
              const error = errors[p.id];
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 px-4 py-3 md:grid md:grid-cols-[1fr_180px_90px_90px_80px] md:items-start md:gap-3 md:py-2 border-b border-black/5 dark:border-white/5 last:border-0"
                >
                  <span className="text-sm font-medium md:pt-1">{p.name}</span>
                  <div className="flex flex-col gap-1">
                    <select
                      value={teamId}
                      onChange={(e) => handleTeamChange(p.id, e.target.value)}
                      disabled={pending === p.id || isUnsold}
                      className={`${selectClass} w-full text-xs py-1`}
                    >
                      <option value="">No team guess</option>
                      {otherTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.teamName}
                        </option>
                      ))}
                    </select>
                    {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:contents">
                    <label className="flex flex-col gap-1 md:block">
                      <span className="text-xs text-black/60 dark:text-white/60 md:hidden">Min amount</span>
                      <input
                        type="number"
                        min={p.basePrice}
                        step="0.01"
                        placeholder={isUnsold ? "—" : `Base ${p.basePrice}`}
                        value={minAmountDrafts[p.id] ?? prediction?.minAmount ?? ""}
                        onChange={(e) => setMinAmountDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={(e) => handleMinAmountBlur(p.id, teamId, e.target.value, Number(p.basePrice))}
                        disabled={pending === p.id || isUnsold}
                        className={`${inputClass} w-full text-xs py-1 md:text-right`}
                      />
                    </label>
                    <label className="flex flex-col gap-1 md:block">
                      <span className="text-xs text-black/60 dark:text-white/60 md:hidden">Max amount</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={isUnsold ? "—" : "Optional"}
                        value={amountDrafts[p.id] ?? prediction?.amount ?? ""}
                        onChange={(e) => setAmountDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={(e) => handleAmountBlur(p.id, teamId, e.target.value)}
                        disabled={pending === p.id || isUnsold}
                        className={`${inputClass} w-full text-xs py-1 md:text-right`}
                      />
                    </label>
                    <label className="flex flex-col items-center gap-1 md:flex md:h-full md:justify-center">
                      <span className="text-xs text-black/60 dark:text-white/60 md:hidden">Unsold</span>
                      <input
                        type="checkbox"
                        checked={isUnsold}
                        onChange={() => handleUnsoldToggle(p.id)}
                        disabled={pending === p.id}
                        className="h-4 w-4 accent-neutral-700 dark:accent-neutral-300 disabled:opacity-50"
                      />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
