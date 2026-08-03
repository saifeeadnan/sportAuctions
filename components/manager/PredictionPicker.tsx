"use client";

import { useState } from "react";
import { savePredictionAction, removePredictionAction } from "@/lib/actions/auctionPrediction.actions";
import { card, selectClass, inputClass, tabsTrack, tabItem } from "@/lib/ui";
import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/services/auctionState.service";
import type { PlayerPrediction } from "@/lib/auction/projectedStandings";

/** Private per-player "who do you think will win this, and for how much"
 * guesses — never shared with other teams, only combined with real
 * sold-player data (in lib/auction/projectedStandings.ts) to project a
 * strength ranking and each team's "reserved" budget. */
export function PredictionPicker({
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
  // Local draft text per player, so typing a digit doesn't have to round-trip
  // to the server before the input reflects it — committed onBlur.
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  // Per-player save errors — a failed save must never fail silently: the
  // amount input keeps showing what was typed regardless of whether it
  // actually persisted, so without this a rejected save (e.g. predicting
  // your own team, or a stale entitlement check) looks identical to success.
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categories = Array.from(new Set(players.map((p) => p.categoryName)));
  // Falls back to the first still-present category if the one a manager had
  // open gets sold out from under them (a live-filtered list, same reason
  // StrategyForm's player pool shrinks mid-auction).
  const effectiveCategory =
    activeCategory && categories.includes(activeCategory) ? activeCategory : (categories[0] ?? null);

  async function handleTeamChange(auctionPlayerId: string, teamId: string) {
    setPending(auctionPlayerId);
    setErrors((prev) => ({ ...prev, [auctionPlayerId]: "" }));
    try {
      if (teamId === "") {
        await removePredictionAction(entryId, auctionPlayerId);
        onPredictionChange(auctionPlayerId, null);
      } else {
        const existingAmount = predictions[auctionPlayerId]?.amount ?? null;
        await savePredictionAction(entryId, auctionPlayerId, teamId, existingAmount);
        onPredictionChange(auctionPlayerId, { teamId, amount: existingAmount });
      }
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [auctionPlayerId]: err instanceof Error ? err.message : "Failed to save prediction",
      }));
    } finally {
      setPending(null);
    }
  }

  async function handleAmountBlur(auctionPlayerId: string, teamId: string, rawValue: string) {
    const trimmed = rawValue.trim();
    const amount = trimmed === "" ? null : Number(trimmed);
    if (amount != null && (Number.isNaN(amount) || amount <= 0)) {
      setErrors((prev) => ({ ...prev, [auctionPlayerId]: "Amount must be a number greater than 0" }));
      return;
    }

    setPending(auctionPlayerId);
    setErrors((prev) => ({ ...prev, [auctionPlayerId]: "" }));
    try {
      await savePredictionAction(entryId, auctionPlayerId, teamId, amount);
      onPredictionChange(auctionPlayerId, { teamId, amount });
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [auctionPlayerId]: err instanceof Error ? err.message : "Failed to save prediction",
      }));
    } finally {
      setPending(null);
    }
  }

  const visiblePlayers = players.filter((p) => p.categoryName === effectiveCategory);

  return (
    <div className="flex flex-col gap-3">
      {categories.length > 0 && (
        <div className={tabsTrack}>
          {categories.map((cat) => {
            const predictedInCategory = players.filter(
              (p) => p.categoryName === cat && predictions[p.id]
            ).length;
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

      <div className={`${card} max-h-[480px] overflow-y-auto`}>
        <ul className="flex flex-col gap-1.5 p-2">
          {visiblePlayers.map((p) => {
            const prediction = predictions[p.id];
            const teamId = prediction?.teamId ?? "";
            const error = errors[p.id];
            return (
              <li
                key={p.id}
                className="flex flex-col gap-1 px-3 py-2 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{p.name}</span>
                  <select
                    value={teamId}
                    onChange={(e) => handleTeamChange(p.id, e.target.value)}
                    disabled={pending === p.id}
                    className={`${selectClass} text-xs py-1`}
                  >
                    <option value="">No prediction</option>
                    {otherTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.teamName}
                      </option>
                    ))}
                  </select>
                  {teamId && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Predicted bid"
                      value={amountDrafts[p.id] ?? prediction?.amount ?? ""}
                      onChange={(e) =>
                        setAmountDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      onBlur={(e) => handleAmountBlur(p.id, teamId, e.target.value)}
                      disabled={pending === p.id}
                      className={`${inputClass} w-24 text-xs py-1`}
                    />
                  )}
                </div>
                {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              </li>
            );
          })}
          {visiblePlayers.length === 0 && (
            <li className="px-3 py-2 text-sm text-black/50 dark:text-white/50">
              No players left to predict.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
