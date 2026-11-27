import { computeMaxBid } from "@/lib/auction/maxBid";
import { computeBidGuidance } from "@/lib/auction/guidance";
import type { AnalyticsCategory, AnalyticsPlayer, AnalyticsTeam, PlayerPredictionInput, SaleEvent } from "./types";

// Contest-probability bounds for a rival deciding whether to bid on a
// non-predicted lot — richer-relative-to-the-field teams contest more often.
// Hardcoded tunable, same convention as playerValue.ts's TIGHT_THRESHOLD_FRACTION.
const MIN_CONTEST_PROBABILITY = 0.15;
const MAX_CONTEST_PROBABILITY = 0.85;

// A team can stretch for a lot it wants, up to this many times its average
// remaining budget per remaining slot — but not its entire legal ceiling,
// which optimistically assumes every future slot gets filled at the
// cheapest remaining price and so wildly overstates a realistic single bid.
// Without this, an early, expensive category (e.g. "Anchor") can consume the
// overwhelming majority of a team's budget on just one or two picks, leaving
// nothing for a mid-priced category that comes up next (e.g. "Riser") even
// though plenty of budget nominally remains.
const BID_FAIR_SHARE_MULTIPLIER = 3;

function fairShareBound(state: TeamRunState): number {
  return (state.budgetRemaining / Math.max(state.slotsRemaining, 1)) * BID_FAIR_SHARE_MULTIPLIER;
}

export type TeamRunState = { budgetRemaining: number; slotsRemaining: number };

export type SimulatedLot =
  | { playerId: string; categoryId: string; teamId: string; price: number; source: "predicted" | "contested" | "self" }
  | { playerId: string; categoryId: string; unsold: true };

/**
 * Snaps a raw (possibly fractional) amount down to the nearest whole-number
 * step a real bid could actually land on: basePrice + k * bidIncrement, or
 * just the nearest whole number when the category has no increment set.
 * Rounds down (never up) so a snapped price never exceeds whatever ceiling
 * was already enforced on the raw amount.
 */
function snapToIncrement(rawAmount: number, basePrice: number, bidIncrement: number | null): number {
  const floored = Math.max(rawAmount, basePrice);
  if (bidIncrement == null || bidIncrement <= 0) {
    return Math.floor(floored);
  }
  const steps = Math.floor((floored - basePrice) / bidIncrement);
  return Math.round(basePrice + steps * bidIncrement);
}

function liveCategoryAvg(categoryId: string, players: AnalyticsPlayer[], salesSoFar: SaleEvent[]): number | null {
  const categoryPlayerIds = new Set(players.filter((p) => p.categoryId === categoryId).map((p) => p.id));
  const categorySales = salesSoFar.filter((s) => categoryPlayerIds.has(s.playerId));
  if (categorySales.length === 0) return null;
  return categorySales.reduce((sum, s) => sum + s.price, 0) / categorySales.length;
}

/** Min category base price across the auction — reimplements budget.service.ts's
 * computeReserveUnit in plain numbers (that one returns Prisma.Decimal and
 * imports Prisma, which this Prisma-free engine can't). Keep in sync if that
 * formula ever changes. */
export function reserveUnit(categories: AnalyticsCategory[]): number {
  if (categories.length === 0) return 0;
  return categories.reduce((min, c) => Math.min(min, c.basePrice), categories[0].basePrice);
}

/** The server-ENFORCED legal max for a team right now (reserveUnit × slots-after-
 * this-win, the same check allocatePlayerToTeam/placeBid actually make). Ground
 * truth for every rival's legality, and the final safety clamp on any price. */
export function legalMaxBidEnforced(state: TeamRunState, unit: number): number {
  if (state.slotsRemaining <= 0) return 0;
  const slotsAfterThisPick = state.slotsRemaining - 1;
  return state.budgetRemaining - unit * slotsAfterThisPick;
}

/**
 * A player the manager has already predicted a winner for — honored as a
 * deterministic outcome rather than randomized, since it's the manager's own
 * informed guess. Call this only when: the prediction actually names a team
 * (a price-only prediction, with no team, can't be honored as a deterministic
 * winner — the caller treats that player as unpredicted instead); and that
 * team's legal room (legalMaxBidEnforced) is still at least the player's base
 * price — the caller (simulateAuctionRun) checks both and falls back to
 * resolveContestedLot otherwise, so a prediction can never force a sale the
 * real server's budget rules wouldn't actually allow (which previously let a
 * team's simulated budget go negative, or hit zero well before its roster
 * was full).
 */
export function resolvePredictedLot(args: {
  player: AnalyticsPlayer;
  category: AnalyticsCategory;
  prediction: Omit<PlayerPredictionInput, "predictedWinnerTeamId"> & { predictedWinnerTeamId: string };
  teamState: ReadonlyMap<string, TeamRunState>;
  unit: number;
  players: AnalyticsPlayer[];
  salesSoFar: SaleEvent[];
}): SimulatedLot {
  const { player, category, prediction, teamState, unit, players, salesSoFar } = args;
  const effectiveBasePrice = player.basePrice;
  const winnerId = prediction.predictedWinnerTeamId;
  const winnerState = teamState.get(winnerId)!;

  const liveAvg = liveCategoryAvg(player.categoryId, players, salesSoFar) ?? effectiveBasePrice;
  const raw = prediction.predictedAmount ?? liveAvg;
  // Guaranteed by the caller's gate to be >= effectiveBasePrice.
  const winnerCeiling = legalMaxBidEnforced(winnerState, unit);
  // A predicted min floors the price even above the raw estimate — e.g. a
  // live-average fallback that happens to sit below the manager's own
  // stated minimum still snaps up to it, as long as it's legally possible.
  const priceFloor = Math.max(effectiveBasePrice, prediction.predictedMinAmount ?? effectiveBasePrice);
  const price = snapToIncrement(
    Math.min(Math.max(raw, priceFloor), winnerCeiling),
    effectiveBasePrice,
    category.bidIncrement
  );

  return { playerId: player.id, categoryId: category.id, teamId: winnerId, price, source: "predicted" };
}

/**
 * A player with no manager prediction — resolved competitively. Self is just
 * one more candidate in the same max/tie-break resolution as every rival,
 * distinguished only in how its amount is derived: deterministically via
 * `computeBidGuidance` (the manager's saved strategy), never randomized.
 */
export function resolveContestedLot(args: {
  player: AnalyticsPlayer;
  category: AnalyticsCategory;
  teams: AnalyticsTeam[];
  selfTeamId: string;
  teamState: ReadonlyMap<string, TeamRunState>;
  unit: number;
  mustHaveIds: ReadonlySet<string>;
  avoidIds: ReadonlySet<string>;
  budgetTargetByCategoryId: ReadonlyMap<string, number>;
  /** Self's own cumulative spend in this player's category so far this run
   * (sum of salesSoFar where teamId === selfTeamId in this categoryId) —
   * subtracted from the category's budget target before it's ever handed
   * to computeBidGuidance, so the target behaves as one depleting pool
   * across every pick in the category (spend 4000 of a 4500 Marquee
   * target on one must-have, and the next Marquee evaluation — must-have
   * or not — only has 500 left to work with, not a fresh 4500) rather than
   * a flat per-player ceiling applied independently to each one. Once the
   * remaining pool hits 0, a non-must-have is excluded from the category
   * entirely for the rest of the run; a must-have still gets a base-price
   * attempt (computeBidGuidance's own floor) — losing that bid is an
   * accepted outcome, not something this engine fights to avoid. */
  selfCategorySpentSoFar: number;
  /** Rival team ids that have already spent, in this run, at or beyond the
   * manager's own "My estimates" (RivalCategoryEstimateInput) budget for
   * this player's category — excluded from contesting this lot, same "stop
   * bidding here once the set budget is reached" gate self's own budget
   * target already gets. Without this, "My estimates" was display-only and
   * never actually shaped how a rival was simulated to bid. */
  teamsOverEstimatedCategoryBudget: ReadonlySet<string>;
  /** The manager's own predicted sale price for this player (Predictions
   * tab), when one was set — honored as a hard ceiling on whoever ends up
   * winning this lot, self included, since nobody could legally outbid past
   * what the manager believes this player will actually fetch. Reached for
   * a player with NO predicted winner (a price-only prediction) or whose
   * predicted winner has since run out of legal room — either way, the
   * belief about price still stands even though the belief about who wins
   * doesn't. Null (the default) when no prediction/amount applies. */
  priceCeiling?: number | null;
  /** The low end of the manager's own predicted price for this player, when
   * one was set — symmetric to priceCeiling: honored as a floor on whoever
   * ends up winning, raised up to (but never past) that winner's own legal
   * room. Null (the default) when no prediction/min applies. */
  priceFloor?: number | null;
  otherMustHavesRemainingInCategory: number;
  /** Pool-aware, excludes this lot — feeds computeMaxBid for self's legal max. */
  remainingPoolBasePricesForSelf: number[];
  /** How many more lots (any category) will be offered after this one, across
   * the whole remaining pool — the denominator for a rival's "urgency" to
   * fill its own slots before the pool of opportunities runs out. */
  remainingLotsAfterThis: number;
  players: AnalyticsPlayer[];
  salesSoFar: SaleEvent[];
  rng: () => number;
}): SimulatedLot {
  const {
    player,
    category,
    teams,
    selfTeamId,
    teamState,
    unit,
    mustHaveIds,
    avoidIds,
    budgetTargetByCategoryId,
    selfCategorySpentSoFar,
    teamsOverEstimatedCategoryBudget,
    priceCeiling = null,
    priceFloor = null,
    otherMustHavesRemainingInCategory,
    remainingPoolBasePricesForSelf,
    remainingLotsAfterThis,
    players,
    salesSoFar,
    rng,
  } = args;

  const effectiveBasePrice = player.basePrice;
  const liveAvgRaw = liveCategoryAvg(player.categoryId, players, salesSoFar);

  const candidates: { teamId: string; amount: number }[] = [];

  const selfState = teamState.get(selfTeamId)!;
  const categoryBudgetCap = budgetTargetByCategoryId.get(player.categoryId) ?? null;
  const isSelfMustHave = mustHaveIds.has(player.id);
  const overCategoryBudgetCap = categoryBudgetCap != null && !isSelfMustHave && selfCategorySpentSoFar >= categoryBudgetCap;
  // The target as one depleting pool: whatever's already gone to earlier
  // picks in this same category (must-have or not) comes off the top
  // before this pick gets a cap to work with — see selfCategorySpentSoFar's
  // own doc comment above.
  const remainingCategoryBudget =
    categoryBudgetCap != null ? Math.max(categoryBudgetCap - selfCategorySpentSoFar, 0) : null;

  // The server-ENFORCED ceiling self will actually be clamped to below —
  // computeMaxBid (pool-aware) can disagree with this, especially when the
  // remaining pool is thin (it optimistically assumes future slots can
  // still be filled at the cheapest remaining price, even if there aren't
  // enough players left to do so). Gating here, the same way rivals are
  // already gated via `eligible`, stops a candidate the clamp would later
  // have to drag below 0 from ever being added in the first place.
  const selfLegalMaxEnforced = legalMaxBidEnforced(selfState, unit);

  if (selfState.slotsRemaining > 0 && selfLegalMaxEnforced >= effectiveBasePrice) {
    const legalMaxSelf = computeMaxBid(remainingPoolBasePricesForSelf, selfState.budgetRemaining, selfState.slotsRemaining);
    let selfBecameCandidate = false;

    // A category budget cap is a veto on the normal guidance-driven path
    // only — it never even gets consulted once the category's own target
    // is exhausted. It must NOT also veto the desperation fallback just
    // below: a manager's per-category targets are a spending PLAN, not a
    // promise to finish with slots unfilled and money unspent once every
    // target happens to be used up. "Budgets take priority over the wish
    // list" means a cap can cost self a bid it would otherwise have won —
    // it was never meant to guarantee an incomplete squad on top of that.
    if (!overCategoryBudgetCap) {
      const guidance = computeBidGuidance({
        basePrice: effectiveBasePrice,
        isMustHave: isSelfMustHave,
        isAvoid: avoidIds.has(player.id),
        categoryTargetAvgPrice: remainingCategoryBudget,
        liveCategoryAvgPrice: liveAvgRaw,
        legalMaxBid: legalMaxSelf,
        otherMustHavesRemainingInCategory,
        predictedRival: null, // never reached for a predicted player, by construction
      });
      if (
        (guidance.signal === "BID" || guidance.signal === "CONSIDER" || guidance.signal === "SPOILER") &&
        guidance.suggestedMaxBid != null
      ) {
        // A must-have (BID) legitimately goes all the way to its legal max —
        // that's the point of marking it must-have. SPOILER is already
        // tightly, deliberately bounded by its own formula. CONSIDER is the
        // one case that can fall back to "no budget target set, here's your
        // raw legal max" — bound that one to a realistic fair share so it
        // doesn't consume nearly the whole budget on a single early pick.
        const selfAmount =
          guidance.signal === "CONSIDER"
            ? Math.min(guidance.suggestedMaxBid, fairShareBound(selfState))
            : guidance.suggestedMaxBid;
        if (selfAmount >= effectiveBasePrice) {
          candidates.push({ teamId: selfTeamId, amount: selfAmount });
          selfBecameCandidate = true;
        }
      }
    }

    if (
      !selfBecameCandidate &&
      !avoidIds.has(player.id) &&
      // No slack left: fewer lots remain (including this one) than self
      // still needs to fill its own roster — skipping here would mathematically
      // guarantee an unfilled slot. A PASS from the manager's own strategy
      // (whether from guidance itself, or an exhausted category cap above)
      // is a recommendation, not a hard veto, so self still tries for it
      // rather than passively finishing short. An avoid tag remains the one
      // absolute veto even here.
      selfState.slotsRemaining >= remainingLotsAfterThis + 1
    ) {
      // Bypassing the category cap's "don't even try" veto above must not
      // also let the PRICE ignore that same category's remaining budget —
      // still respect whatever's left of it, floored at base price (same
      // reasoning as the must-have cap's own floor in guidance.ts) so a
      // fully-exhausted category still gets a last-resort attempt instead
      // of an unbounded one. Safe to floor unconditionally: the outer gate
      // above already confirmed effectiveBasePrice is legally affordable
      // (selfLegalMaxEnforced), and the final winning price gets re-clamped
      // against that same hard ceiling below regardless of this amount.
      const categoryCappedLegalMax =
        remainingCategoryBudget != null ? Math.min(legalMaxSelf, remainingCategoryBudget) : legalMaxSelf;
      const desperationAmount = Math.max(Math.min(categoryCappedLegalMax, fairShareBound(selfState)), effectiveBasePrice);
      candidates.push({ teamId: selfTeamId, amount: desperationAmount });
    }
  }

  const eligible = teams
    .filter(
      (t) =>
        t.id !== selfTeamId &&
        (teamState.get(t.id)?.slotsRemaining ?? 0) > 0 &&
        !teamsOverEstimatedCategoryBudget.has(t.id)
    )
    .map((t) => ({ teamId: t.id, legalMax: legalMaxBidEnforced(teamState.get(t.id)!, unit) }))
    .filter((e) => e.legalMax >= effectiveBasePrice);

  const richest = eligible.reduce((max, e) => Math.max(max, e.legalMax), 0);
  const liveAvg = liveAvgRaw ?? effectiveBasePrice;

  for (const { teamId, legalMax } of eligible) {
    const richnessProbability =
      MIN_CONTEST_PROBABILITY +
      (richest === 0 ? 0 : legalMax / richest) * (MAX_CONTEST_PROBABILITY - MIN_CONTEST_PROBABILITY);
    // Rises toward 1.0 as this team's remaining slots catch up to how many
    // lots are even left to bid on — a team simply poorer than its peers
    // still gets desperate near the end rather than passively losing every
    // probability draw and finishing with empty slots and unspent budget.
    const slotsRemaining = teamState.get(teamId)!.slotsRemaining;
    const urgencyProbability = Math.min(1, slotsRemaining / Math.max(remainingLotsAfterThis, 1));
    const contestProbability = Math.max(richnessProbability, urgencyProbability);
    if (rng() < contestProbability) {
      // Same fair-share reasoning as self's CONSIDER case above: randomize
      // within a realistic range, not all the way up to the full legal
      // ceiling (which assumes bankrupting every future slot for this pick).
      const high = Math.min(legalMax, fairShareBound(teamState.get(teamId)!));
      const low = Math.min(liveAvg, high);
      const amount = Math.max(low + rng() * (high - low), effectiveBasePrice);
      candidates.push({ teamId, amount });
    }
  }

  if (candidates.length === 0) {
    return { playerId: player.id, categoryId: category.id, unsold: true };
  }

  // Never below base price even if a predicted ceiling/floor was set too
  // low or high to be realistic (a predicted amount is a belief, not a
  // guarantee) — same floor-safety convention snapToIncrement already
  // applies below.
  const effectivePriceCeiling = priceCeiling != null ? Math.max(effectiveBasePrice, priceCeiling) : null;
  const effectivePriceFloor = Math.max(effectiveBasePrice, priceFloor ?? effectiveBasePrice);
  const clamped = candidates.map((c) => {
    const legalMax = legalMaxBidEnforced(teamState.get(c.teamId)!, unit);
    // Ceiling first, then floor — floor never pushes a candidate PAST their
    // own ceiling/legal room, it only ever raises them toward it.
    const cap = effectivePriceCeiling != null ? Math.min(legalMax, effectivePriceCeiling) : legalMax;
    const floor = Math.min(cap, effectivePriceFloor);
    return { ...c, amount: Math.min(Math.max(c.amount, floor), cap) };
  });

  let winner = clamped[0];
  for (let i = 1; i < clamped.length; i++) {
    const candidate = clamped[i];
    if (candidate.amount > winner.amount || (candidate.amount === winner.amount && rng() < 0.5)) {
      winner = candidate;
    }
  }

  return {
    playerId: player.id,
    categoryId: category.id,
    teamId: winner.teamId,
    price: snapToIncrement(winner.amount, effectiveBasePrice, category.bidIncrement),
    source: winner.teamId === selfTeamId ? "self" : "contested",
  };
}
