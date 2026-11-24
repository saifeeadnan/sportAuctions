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

  // A team, a max amount, and a min amount are all independent now — any
  // can be set without the others. Only when ALL THREE end up empty is
  // there nothing left to represent, so that's the one case that removes
  // the row entirely.
  async function persistPrediction(
    auctionPlayerId: string,
    teamIdOrEmpty: string,
    amount: number | null,
    minAmount: number | null
  ) {
    const teamId = teamIdOrEmpty === "" ? null : teamIdOrEmpty;
    setPending(auctionPlayerId);
    setErrors((prev) => ({ ...prev, [auctionPlayerId]: "" }));
    if (teamId == null && amount == null && minAmount == null) {
      const result = await removePredictionAction(entryId, auctionPlayerId);
      if (result.error) {
        setErrors((prev) => ({ ...prev, [auctionPlayerId]: result.error }));
      } else {
        onPredictionChange(auctionPlayerId, null);
      }
    } else {
      const result = await savePredictionAction(entryId, auctionPlayerId, teamId, amount, minAmount);
      if (result.error) {
        setErrors((prev) => ({ ...prev, [auctionPlayerId]: result.error }));
      } else {
        onPredictionChange(auctionPlayerId, { teamId, amount, minAmount });
      }
    }
    setPending(null);
  }

  async function handleTeamChange(auctionPlayerId: string, teamIdOrEmpty: string) {
    const existing = predictions[auctionPlayerId];
    await persistPrediction(auctionPlayerId, teamIdOrEmpty, existing?.amount ?? null, existing?.minAmount ?? null);
  }

  function parseAmountBlur(auctionPlayerId: string, label: string, rawValue: string): number | null | undefined {
    const trimmed = rawValue.trim();
    const amount = trimmed === "" ? null : Number(trimmed);
    if (amount != null && (Number.isNaN(amount) || amount <= 0)) {
      setErrors((prev) => ({ ...prev, [auctionPlayerId]: `${label} must be a number greater than 0` }));
      return undefined;
    }
    return amount;
  }

  async function handleAmountBlur(auctionPlayerId: string, teamIdOrEmpty: string, rawValue: string) {
    const amount = parseAmountBlur(auctionPlayerId, "Amount", rawValue);
    if (amount === undefined) return;
    const existingMinAmount = predictions[auctionPlayerId]?.minAmount ?? null;
    await persistPrediction(auctionPlayerId, teamIdOrEmpty, amount, existingMinAmount);
  }

  async function handleMinAmountBlur(auctionPlayerId: string, teamIdOrEmpty: string, rawValue: string) {
    const minAmount = parseAmountBlur(auctionPlayerId, "Min amount", rawValue);
    if (minAmount === undefined) return;
    const existingAmount = predictions[auctionPlayerId]?.amount ?? null;
    await persistPrediction(auctionPlayerId, teamIdOrEmpty, existingAmount, minAmount);
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

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pl-4 pr-4">Player</th>
              <th className="py-2 pr-4">Predicted winner</th>
              <th className="py-2 pr-4 text-right">Min amount</th>
              <th className="py-2 pr-4 text-right">Max amount</th>
            </tr>
          </thead>
          <tbody>
            {visiblePlayers.map((p) => {
              const prediction = predictions[p.id];
              const teamId = prediction?.teamId ?? "";
              const error = errors[p.id];
              return (
                <tr key={p.id} className="border-b border-black/5 dark:border-white/5 last:border-0 align-top">
                  <td className="py-2 pl-4 pr-4">{p.name}</td>
                  <td className="py-2 pr-4">
                    <select
                      value={teamId}
                      onChange={(e) => handleTeamChange(p.id, e.target.value)}
                      disabled={pending === p.id}
                      className={`${selectClass} text-xs py-1`}
                    >
                      <option value="">No team guess</option>
                      {otherTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.teamName}
                        </option>
                      ))}
                    </select>
                    {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Optional"
                      value={minAmountDrafts[p.id] ?? prediction?.minAmount ?? ""}
                      onChange={(e) => setMinAmountDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onBlur={(e) => handleMinAmountBlur(p.id, teamId, e.target.value)}
                      disabled={pending === p.id}
                      className={`${inputClass} w-24 text-xs py-1 text-right`}
                    />
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Optional"
                      value={amountDrafts[p.id] ?? prediction?.amount ?? ""}
                      onChange={(e) => setAmountDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onBlur={(e) => handleAmountBlur(p.id, teamId, e.target.value)}
                      disabled={pending === p.id}
                      className={`${inputClass} w-24 text-xs py-1 text-right`}
                    />
                  </td>
                </tr>
              );
            })}
            {visiblePlayers.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 pl-4 text-sm text-black/50 dark:text-white/50">
                  No players left to predict.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
