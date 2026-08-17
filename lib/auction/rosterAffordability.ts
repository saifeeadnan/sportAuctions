import { rankCategoriesByBasePrice } from "@/lib/auction/projectedStandings";

export type RosterAffordability = {
  teamId: string;
  teamName: string;
  budgetRemaining: number;
  slotsToFill: number;
  /** Budget remaining ÷ slots still to fill — null once a roster is full
   * (nothing left to average over). */
  averageAffordability: number | null;
  /** Sold-player counts per category, keyed the same way across every team
   * (zeros where a team has none) so a table can use one consistent column
   * order — highest base price first, same ranking TeamProjectionBoard
   * already uses for its category columns. */
  categoryCounts: Record<string, number>;
};

/**
 * Every team's average affordability — budget left divided by however many
 * roster slots they still need to fill — ranked highest first. A live,
 * room-wide read on who has the most buying power per remaining pick right
 * now, not a per-player prediction.
 */
export function computeRosterAffordability(
  teams: { id: string; teamName: string; budgetRemaining: string; slotsFilled: number; slotsTotal: number }[],
  players: { categoryName: string; basePrice: string; status: string; soldToEntryId: string | null }[]
): RosterAffordability[] {
  const categories = rankCategoriesByBasePrice(players);

  const rows = teams.map((t) => {
    const slotsToFill = Math.max(t.slotsTotal - t.slotsFilled, 0);
    const budgetRemaining = Number(t.budgetRemaining);

    const categoryCounts: Record<string, number> = Object.fromEntries(categories.map((c) => [c, 0]));
    for (const p of players) {
      if (p.status === "SOLD" && p.soldToEntryId === t.id) {
        categoryCounts[p.categoryName] += 1;
      }
    }

    return {
      teamId: t.id,
      teamName: t.teamName,
      budgetRemaining,
      slotsToFill,
      averageAffordability: slotsToFill > 0 ? budgetRemaining / slotsToFill : null,
      categoryCounts,
    };
  });

  // Highest affordability first; a full roster has nothing left to average
  // over, so it sorts last rather than being ranked.
  return rows.sort((a, b) => {
    if (a.averageAffordability == null) return b.averageAffordability == null ? 0 : 1;
    if (b.averageAffordability == null) return -1;
    return b.averageAffordability - a.averageAffordability;
  });
}
