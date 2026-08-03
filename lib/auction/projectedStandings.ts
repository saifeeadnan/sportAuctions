import { computeTeamStrength, type RatedPlayer } from "@/lib/teamStrength";
import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/services/auctionState.service";

/** A manager's own private guess: which team wins this player, and
 * optionally how much that manager thinks it'll cost them. */
export type PlayerPrediction = { teamId: string; amount: number | null };

export type TeamProjection = {
  teamId: string;
  teamName: string;
  actualStrength: ReturnType<typeof computeTeamStrength>;
  projectedStrength: ReturnType<typeof computeTeamStrength>;
  projectedRosterSize: number;
  budgetRemaining: string;
  /** Sum of predicted-amount guesses across this team's still-available
   * predicted wins — a rough idea of how much of their budget is already
   * "spoken for" by picks other than whoever's on the clock right now. */
  predictedReserve: number;
};

const STILL_AVAILABLE_STATUSES = new Set(["AVAILABLE", "IN_PRE_AUCTION_POOL", "IN_BIDDING", "UNSOLD"]);

function toRatedPlayer(p: AuctionStatePlayer): RatedPlayer {
  return {
    position: p.position,
    rating: p.rating,
    battingRating: p.battingRating,
    bowlingRating: p.bowlingRating,
    fieldingRating: p.fieldingRating,
  };
}

/**
 * Per team: real sold players plus this manager's own private predictions for
 * who'll win each still-available player — never another team's predictions,
 * since those are never fetched for anyone but the caller. Sorted by
 * projected strength, same ranking signal fantasyTeam.service.ts's
 * getFantasyStandings already uses as its pre-real-points fallback.
 */
export function computeProjectedStandings(
  players: AuctionStatePlayer[],
  teams: AuctionStateTeam[],
  predictions: Record<string, PlayerPrediction>
): TeamProjection[] {
  const projections = teams.map((team) => {
    const actual = players.filter((p) => p.soldToEntryId === team.id);
    const predicted = players.filter(
      (p) => STILL_AVAILABLE_STATUSES.has(p.status) && predictions[p.id]?.teamId === team.id
    );
    const predictedReserve = predicted.reduce(
      (sum, p) => sum + (predictions[p.id]?.amount ?? 0),
      0
    );

    return {
      teamId: team.id,
      teamName: team.teamName,
      actualStrength: computeTeamStrength(actual.map(toRatedPlayer)),
      projectedStrength: computeTeamStrength([...actual, ...predicted].map(toRatedPlayer)),
      projectedRosterSize: actual.length + predicted.length,
      budgetRemaining: team.budgetRemaining,
      predictedReserve,
    };
  });

  return projections.sort((a, b) => b.projectedStrength.teamStrength - a.projectedStrength.teamStrength);
}
