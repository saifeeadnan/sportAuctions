"use client";

import { useState } from "react";
import { savePredictionAction, removePredictionAction } from "@/lib/actions/auctionPrediction.actions";
import { setPlayerPreferenceAction } from "@/lib/actions/auctionStrategy.actions";
import { card, selectClass, inputClass, tabsTrack, tabItem } from "@/lib/ui";
import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/services/auctionState.service";
import type { PlayerPrediction } from "@/lib/auction/projectedStandings";

type PreferenceState = "MUST_HAVE" | "AVOID" | null;

/**
 * Wish list (must-have/avoid) and Predictions (who wins each remaining
 * player) merged into one per-player list — both operate over the same
 * not-yet-sold players grouped by the same categories, so tagging your own
 * intent and guessing the auction's outcome for a player happen in the same
 * row instead of two separate tabs. Supersedes the standalone
 * V2PredictionPicker and v2's use of StrategyForm's must-have/avoid picker.
 * Every control autosaves immediately on its own, same pattern as the rest
 * of Analytics v2 (see autosave-wishlist-budgets-plan.md).
 */
export function WishlistAndPredictionsPicker({
  entryId,
  players,
  otherTeams,
  initialMustHaveIds,
  initialAvoidIds,
  predictions,
  onPredictionChange,
}: {
  entryId: string;
  players: AuctionStatePlayer[];
  otherTeams: AuctionStateTeam[];
  initialMustHaveIds: string[];
  initialAvoidIds: string[];
  predictions: Record<string, PlayerPrediction>;
  onPredictionChange: (auctionPlayerId: string, prediction: PlayerPrediction | null) => void;
}) {
  const [preferences, setPreferences] = useState<Map<string, PreferenceState>>(() => {
    const map = new Map<string, PreferenceState>();
    for (const id of initialMustHaveIds) map.set(id, "MUST_HAVE");
    for (const id of initialAvoidIds) map.set(id, "AVOID");
    return map;
  });
  const [pendingPreferenceIds, setPendingPreferenceIds] = useState<Set<string>>(new Set());
  const [preferenceErrors, setPreferenceErrors] = useState<Record<string, string>>({});

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [predictionPending, setPredictionPending] = useState<string | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [minAmountDrafts, setMinAmountDrafts] = useState<Record<string, string>>({});
  const [predictionErrors, setPredictionErrors] = useState<Record<string, string>>({});

  const categories = Array.from(new Set(players.map((p) => p.categoryName)));
  const effectiveCategory =
    activeCategory && categories.includes(activeCategory) ? activeCategory : (categories[0] ?? null);

  async function togglePreference(playerId: string, value: "MUST_HAVE" | "AVOID") {
    const previous = preferences.get(playerId) ?? null;
    const next = previous === value ? null : value; // clicking the active one again clears it

    setPreferences((prev) => {
      const map = new Map(prev);
      if (next === null) map.delete(playerId);
      else map.set(playerId, next);
      return map;
    });
    setPreferenceErrors((prev) => ({ ...prev, [playerId]: "" }));
    setPendingPreferenceIds((prev) => new Set(prev).add(playerId));

    const result = await setPlayerPreferenceAction(entryId, playerId, next);

    setPendingPreferenceIds((prev) => {
      const set = new Set(prev);
      set.delete(playerId);
      return set;
    });

    if (result.error) {
      setPreferences((prev) => {
        const map = new Map(prev);
        if (previous === null) map.delete(playerId);
        else map.set(playerId, previous);
        return map;
      });
      setPreferenceErrors((prev) => ({ ...prev, [playerId]: result.error }));
    }
  }

  // Prediction persistence below is unchanged from the standalone
  // Predictions tab it replaces — a team, a max amount, and a min amount
  // are all independent of each other; "unsold" is mutually exclusive with
  // all three, so setting it always clears the other three and vice versa.
  async function persistPrediction(
    auctionPlayerId: string,
    teamIdOrEmpty: string,
    amount: number | null,
    minAmount: number | null,
    unsold: boolean
  ) {
    const teamId = teamIdOrEmpty === "" ? null : teamIdOrEmpty;
    setPredictionPending(auctionPlayerId);
    setPredictionErrors((prev) => ({ ...prev, [auctionPlayerId]: "" }));
    if (teamId == null && amount == null && minAmount == null && !unsold) {
      const result = await removePredictionAction(entryId, auctionPlayerId);
      if (result.error) {
        setPredictionErrors((prev) => ({ ...prev, [auctionPlayerId]: result.error }));
      } else {
        onPredictionChange(auctionPlayerId, null);
      }
    } else {
      const result = await savePredictionAction(entryId, auctionPlayerId, teamId, amount, minAmount, unsold);
      if (result.error) {
        setPredictionErrors((prev) => ({ ...prev, [auctionPlayerId]: result.error }));
      } else {
        onPredictionChange(auctionPlayerId, { teamId, amount, minAmount, unsold });
      }
    }
    setPredictionPending(null);
  }

  async function handleTeamChange(auctionPlayerId: string, teamIdOrEmpty: string) {
    const existing = predictions[auctionPlayerId];
    await persistPrediction(auctionPlayerId, teamIdOrEmpty, existing?.amount ?? null, existing?.minAmount ?? null, false);
  }

  async function handleUnsoldToggle(auctionPlayerId: string) {
    const alreadyUnsold = predictions[auctionPlayerId]?.unsold ?? false;
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
      setPredictionErrors((prev) => ({ ...prev, [auctionPlayerId]: `${label} must be a number greater than 0` }));
      return undefined;
    }
    if (amount != null && floor != null && amount < floor) {
      setPredictionErrors((prev) => ({ ...prev, [auctionPlayerId]: `${label} can't be below the base price (${floor})` }));
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
      <p className="text-xs text-black/60 dark:text-white/60">
        Tag must-haves/avoids and guess who wins each remaining player — both save automatically.
        Your predictions are private and also feed the Simulate tab.
      </p>

      {categories.length > 0 && (
        <div className={tabsTrack}>
          {categories.map((cat) => {
            const playersInCategory = players.filter((p) => p.categoryName === cat);
            const engagedCount = playersInCategory.filter((p) => preferences.get(p.id) || predictions[p.id]).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={tabItem(effectiveCategory === cat)}
              >
                {cat} ({engagedCount}/{playersInCategory.length})
              </button>
            );
          })}
        </div>
      )}

      <div className={card}>
        <div className="hidden md:grid grid-cols-[1fr_150px_180px_90px_90px_80px] gap-3 px-4 py-2 text-xs text-black/60 dark:text-white/60 border-b border-black/10 dark:border-white/10">
          <span>Player</span>
          <span>Wish list</span>
          <span>Predicted winner</span>
          <span className="text-right">Min amount</span>
          <span className="text-right">Max amount</span>
          <span className="text-center">Unsold</span>
        </div>
        {visiblePlayers.length === 0 ? (
          <p className="py-3 px-4 text-sm text-black/50 dark:text-white/50">No players left in this category.</p>
        ) : (
          <ul className="flex flex-col">
            {visiblePlayers.map((p) => {
              const preferenceState = preferences.get(p.id) ?? null;
              const isPreferencePending = pendingPreferenceIds.has(p.id);
              const preferenceError = preferenceErrors[p.id];

              const prediction = predictions[p.id];
              const teamId = prediction?.teamId ?? "";
              const isUnsold = prediction?.unsold ?? false;
              const isPredictionPending = predictionPending === p.id;
              const predictionError = predictionErrors[p.id];

              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 px-4 py-3 md:grid md:grid-cols-[1fr_150px_180px_90px_90px_80px] md:items-start md:gap-3 md:py-2 border-b border-black/5 dark:border-white/5 last:border-0"
                >
                  <span className="text-sm font-medium md:pt-1">
                    {p.name}{" "}
                    <span className="text-xs text-black/50 dark:text-white/50">base {p.basePrice}</span>
                  </span>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => togglePreference(p.id, "MUST_HAVE")}
                        disabled={isPreferencePending}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          preferenceState === "MUST_HAVE"
                            ? "bg-emerald-600 text-white"
                            : "bg-black/[0.05] dark:bg-white/[0.08] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                        }`}
                      >
                        Must-have
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePreference(p.id, "AVOID")}
                        disabled={isPreferencePending}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          preferenceState === "AVOID"
                            ? "bg-red-600 text-white"
                            : "bg-black/[0.05] dark:bg-white/[0.08] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                        }`}
                      >
                        Avoid
                      </button>
                    </div>
                    {preferenceError && <p className="text-xs text-red-600 dark:text-red-400">{preferenceError}</p>}
                  </div>

                  <div className="flex flex-col gap-1">
                    <select
                      value={teamId}
                      onChange={(e) => handleTeamChange(p.id, e.target.value)}
                      disabled={isPredictionPending || isUnsold}
                      className={`${selectClass} w-full text-xs py-1`}
                    >
                      <option value="">No team guess</option>
                      {otherTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.teamName}
                        </option>
                      ))}
                    </select>
                    {predictionError && <p className="text-xs text-red-600 dark:text-red-400">{predictionError}</p>}
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
                        disabled={isPredictionPending || isUnsold}
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
                        disabled={isPredictionPending || isUnsold}
                        className={`${inputClass} w-full text-xs py-1 md:text-right`}
                      />
                    </label>
                    <label className="flex flex-col items-center gap-1 md:flex md:h-full md:justify-center">
                      <span className="text-xs text-black/60 dark:text-white/60 md:hidden">Unsold</span>
                      <input
                        type="checkbox"
                        checked={isUnsold}
                        onChange={() => handleUnsoldToggle(p.id)}
                        disabled={isPredictionPending}
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
