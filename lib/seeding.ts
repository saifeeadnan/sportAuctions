/**
 * Pure logic for the peer-seeding feature (no Prisma import — shared with
 * the mobile app via `@/lib/*`). "Seed" here is a peer-sourced ranking
 * concept (1 = best), entirely separate from the admin-entered `rating`
 * columns on Player.
 */

export type SeedingWindowStatus = "scheduled" | "open" | "closed" | "finalized";

/** Finalized always wins, even if closesAt is somehow still in the future
 * (an admin can finalize early once the window has been manually closed by
 * editing closesAt — there's no separate "force close" action). Otherwise a
 * simple three-way split on the two dates. */
export function seedingWindowStatus(
  w: { opensAt: Date; closesAt: Date; finalizedAt: Date | null },
  now: Date = new Date()
): SeedingWindowStatus {
  if (w.finalizedAt != null) return "finalized";
  if (now < w.opensAt) return "scheduled";
  if (now < w.closesAt) return "open";
  return "closed";
}

export type SuggestedSeedRow = {
  playerId: string;
  avgSeed: number | null;
  ratingCount: number;
  suggestedSeed: number;
  /** Players sharing this id have an identical (2dp-rounded) average — the
   * UI flags them for the admin to break the tie manually. Null = no tie. */
  tieGroup: number | null;
};

/**
 * Turns raw per-rater submissions into a suggested seeding order: rated
 * players first (lower average = better, i.e. seed 1), unrated players last.
 * Ties are broken by player name only — never by rating count — since
 * breaking a tie by count would let an admin infer who rated a given player
 * by watching the order shift as more submissions arrive.
 */
export function computeSuggestedSeeding(
  players: { playerId: string; name: string }[],
  submissions: { playerId: string; seed: number }[]
): SuggestedSeedRow[] {
  const byPlayer = new Map<string, number[]>();
  for (const s of submissions) {
    const arr = byPlayer.get(s.playerId);
    if (arr) arr.push(s.seed);
    else byPlayer.set(s.playerId, [s.seed]);
  }

  const stats = players.map((p) => {
    const seeds = byPlayer.get(p.playerId) ?? [];
    const ratingCount = seeds.length;
    const avgSeedRaw = ratingCount > 0 ? seeds.reduce((a, b) => a + b, 0) / ratingCount : null;
    // Rounded to 2dp for both display and tie comparison — two averages
    // that differ only past the 2nd decimal read as "the same" to a human
    // and should tie rather than get an arbitrary order.
    const avgSeed = avgSeedRaw != null ? Math.round(avgSeedRaw * 100) / 100 : null;
    return { playerId: p.playerId, name: p.name, avgSeed, ratingCount };
  });

  const rated = stats
    .filter((s) => s.avgSeed != null)
    .sort((a, b) => (a.avgSeed! - b.avgSeed!) || a.name.localeCompare(b.name));
  const unrated = stats
    .filter((s) => s.avgSeed == null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const ordered = [...rated, ...unrated];

  // Assign tie-group ids among consecutive rated players sharing an avgSeed.
  const tieGroupByPlayer = new Map<string, number>();
  let nextTieGroup = 1;
  for (let i = 0; i < rated.length; i++) {
    const isTiedWithNext = i < rated.length - 1 && rated[i].avgSeed === rated[i + 1].avgSeed;
    const isTiedWithPrev = i > 0 && rated[i].avgSeed === rated[i - 1].avgSeed;
    if (isTiedWithNext || isTiedWithPrev) {
      const group = isTiedWithPrev ? tieGroupByPlayer.get(rated[i - 1].playerId)! : nextTieGroup++;
      tieGroupByPlayer.set(rated[i].playerId, group);
    }
  }

  return ordered.map((s, i) => ({
    playerId: s.playerId,
    avgSeed: s.avgSeed,
    ratingCount: s.ratingCount,
    suggestedSeed: i + 1,
    tieGroup: tieGroupByPlayer.get(s.playerId) ?? null,
  }));
}
