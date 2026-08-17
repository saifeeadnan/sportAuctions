import { computeTeamStrength } from "@/lib/teamStrength";
import { toRatedPlayer } from "./playerValue";
import type { AnalyticsTeam, AnalyticsPlayer, SaleEvent, PlayerValueScore } from "./types";

export type RivalRosterEntry = {
  playerId: string;
  categoryId: string;
  price: number;
  valueScore: number | null;
};

export type RivalRoster = {
  teamId: string;
  budgetRemaining: number;
  teamStrength: number;
  entries: RivalRosterEntry[];
};

/** Every team's currently-confirmed roster (who they've actually won so
 * far, and at what price), highest value first within each team, plus that
 * team's current budget remaining and computed team strength
 * (lib/teamStrength.ts — same formula used everywhere else in the app). */
export function computeRivalRosters(
  teams: AnalyticsTeam[],
  players: AnalyticsPlayer[],
  sales: SaleEvent[],
  valueScores: PlayerValueScore[]
): RivalRoster[] {
  const playerById = new Map(players.map((p) => [p.id, p]));
  const valueByPlayerId = new Map(valueScores.map((v) => [v.playerId, v.value]));

  return teams.map((team) => {
    const teamSales = sales.filter((s) => s.teamId === team.id);
    const soldPlayers = teamSales
      .map((s) => playerById.get(s.playerId))
      .filter((p): p is AnalyticsPlayer => p != null);

    return {
      teamId: team.id,
      budgetRemaining: team.budgetRemaining,
      teamStrength: computeTeamStrength(soldPlayers.map(toRatedPlayer)).teamStrength,
      entries: teamSales
        .map((s) => ({
          playerId: s.playerId,
          categoryId: playerById.get(s.playerId)?.categoryId ?? "",
          price: s.price,
          valueScore: valueByPlayerId.get(s.playerId) ?? null,
        }))
        .sort((a, b) => (b.valueScore ?? -Infinity) - (a.valueScore ?? -Infinity)),
    };
  });
}
