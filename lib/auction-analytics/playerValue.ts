import { skillScore, type RatedPlayer } from "@/lib/teamStrength";
import type { AnalyticsPlayer, PlayerValueScore } from "./types";

/** Shared with rivalRosters.ts, which needs the same conversion to compute
 * a roster's team strength via lib/teamStrength.ts's computeTeamStrength. */
export function toRatedPlayer(p: AnalyticsPlayer): RatedPlayer {
  return {
    position: p.position ?? null,
    rating: p.rating != null ? String(p.rating) : null,
    battingRating: p.battingRating != null ? String(p.battingRating) : null,
    bowlingRating: p.bowlingRating != null ? String(p.bowlingRating) : null,
    fieldingRating: p.fieldingRating != null ? String(p.fieldingRating) : null,
  };
}

/**
 * Value-over-replacement, per category: how much better/worse a player's
 * skillScore (lib/teamStrength.ts — already position-aware, reused rather
 * than inventing a new rating formula) is than the weakest player in the
 * same category among the given pool.
 *
 * Replacement level is deliberately the category's minimum skillScore, not
 * an Nth-percentile cut — the honest option given no real data yet on how
 * many of a category actually get rostered (see plan). Revisit once that's
 * been checked against a real auction.
 */
export function computePlayerValueScores(players: AnalyticsPlayer[]): PlayerValueScore[] {
  const scored = players.map((player) => ({ player, skillScore: skillScore(toRatedPlayer(player)) }));

  const replacementLevelByCategory = new Map<string, number>();
  for (const { player, skillScore: score } of scored) {
    const current = replacementLevelByCategory.get(player.categoryId);
    if (current === undefined || score < current) {
      replacementLevelByCategory.set(player.categoryId, score);
    }
  }

  return scored.map(({ player, skillScore: score }) => {
    const replacementLevel = replacementLevelByCategory.get(player.categoryId) ?? 0;
    return {
      playerId: player.id,
      categoryId: player.categoryId,
      skillScore: score,
      replacementLevel,
      value: score - replacementLevel,
    };
  });
}
