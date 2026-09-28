// Pure, no Prisma import — reimplements Downloads\Pickleball_Schedule.xlsx's
// Match Results + Standings tabs as real code instead of spreadsheet formulas,
// so the app never needs those tabs re-uploaded. Used server-side only today,
// kept import-free so it stays trivially unit-testable.

export type PickleballGameScore = {
  gameNumber: number;
  team1Score: number | null;
  team2Score: number | null;
};

export type PickleballMatchForStandings = {
  id: string;
  team1Id: string;
  team2Id: string;
  gamesToPlay: number;
  games: PickleballGameScore[];
};

export type PickleballMatchResult = {
  matchId: string;
  team1GamesWon: number;
  team2GamesWon: number;
  team1Points: number;
  team2Points: number;
  gamesNeededToWin: number;
  winnerId: string | null;
  isDecided: boolean;
};

/**
 * One match's result from its games, mirroring the workbook's Match Results
 * tab: games/points sum every game with both scores present, regardless of
 * whether the match is decided yet (the Excel's SUMIFS didn't gate on that
 * either). A game is only counted once both scores are in; a tied game score
 * is unrepresentable by construction (rejected where scores are written, see
 * pickleballScoring.service.ts) so it's simply skipped here rather than
 * thrown on — this function only ever reads what's already valid.
 */
export function computeMatchResult(match: PickleballMatchForStandings): PickleballMatchResult {
  const gamesNeededToWin = Math.ceil(match.gamesToPlay / 2);
  let team1GamesWon = 0;
  let team2GamesWon = 0;
  let team1Points = 0;
  let team2Points = 0;

  for (const game of match.games) {
    if (game.team1Score == null || game.team2Score == null) continue;
    team1Points += game.team1Score;
    team2Points += game.team2Score;
    if (game.team1Score > game.team2Score) team1GamesWon += 1;
    else if (game.team2Score > game.team1Score) team2GamesWon += 1;
  }

  const isDecided = team1GamesWon >= gamesNeededToWin || team2GamesWon >= gamesNeededToWin;
  const winnerId = !isDecided ? null : team1GamesWon >= gamesNeededToWin ? match.team1Id : match.team2Id;

  return { matchId: match.id, team1GamesWon, team2GamesWon, team1Points, team2Points, gamesNeededToWin, winnerId, isDecided };
}

export type PickleballStandingsRow = {
  teamId: string;
  group: string;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  rank: number;
};

type StandingsAccumulator = Omit<PickleballStandingsRow, "rank">;

/**
 * Ranks within one group, Excel-`RANK()`-style: teams tied on every tie-break
 * key share a rank, and the next distinct group of teams skips ahead by the
 * number tied (1, 1, 3 — never 1, 1, 2). Sort order matches the workbook's
 * Standings tab exactly: match wins, then games won, then point diff, all
 * descending.
 */
function rankGroup(rows: StandingsAccumulator[]): PickleballStandingsRow[] {
  const sorted = [...rows].sort(
    (a, b) => b.matchWins - a.matchWins || b.gamesWon - a.gamesWon || b.pointDiff - a.pointDiff
  );
  const ranked: PickleballStandingsRow[] = [];
  let rank = 0;
  let seen = 0;
  let prevKey: string | null = null;
  for (const row of sorted) {
    seen += 1;
    const key = `${row.matchWins}|${row.gamesWon}|${row.pointDiff}`;
    if (key !== prevKey) {
      rank = seen;
      prevKey = key;
    }
    ranked.push({ ...row, rank });
  }
  return ranked;
}

/**
 * The workbook's Standings tab, computed live from every match's games. Every
 * team in `teams` gets a row even with zero matches played (so a pool lists
 * all its teams from the moment the schedule is uploaded, not just once
 * they've played), grouped and ranked by its own group/pool — a match's own
 * `group` label isn't consulted here since the upload validator already
 * guarantees a match's two teams share one group (see
 * lib/pickleballSchedule/schema.ts). Groups are returned in the order they
 * first appear in `teams`, each internally ordered by rank.
 */
export function computeStandings(
  teams: { teamId: string; group: string }[],
  matches: PickleballMatchForStandings[]
): PickleballStandingsRow[] {
  const rows = new Map<string, StandingsAccumulator>();
  const groupOrder: string[] = [];
  for (const team of teams) {
    if (!rows.has(team.teamId)) {
      rows.set(team.teamId, {
        teamId: team.teamId,
        group: team.group,
        matchesPlayed: 0,
        matchWins: 0,
        matchLosses: 0,
        gamesWon: 0,
        gamesLost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
      });
    }
    if (!groupOrder.includes(team.group)) groupOrder.push(team.group);
  }

  for (const match of matches) {
    const row1 = rows.get(match.team1Id);
    const row2 = rows.get(match.team2Id);
    if (!row1 || !row2) continue; // defensive: a match must reference two of `teams`

    const result = computeMatchResult(match);
    row1.gamesWon += result.team1GamesWon;
    row1.gamesLost += result.team2GamesWon;
    row2.gamesWon += result.team2GamesWon;
    row2.gamesLost += result.team1GamesWon;
    row1.pointsFor += result.team1Points;
    row1.pointsAgainst += result.team2Points;
    row2.pointsFor += result.team2Points;
    row2.pointsAgainst += result.team1Points;

    if (result.isDecided) {
      row1.matchesPlayed += 1;
      row2.matchesPlayed += 1;
      if (result.winnerId === match.team1Id) {
        row1.matchWins += 1;
        row2.matchLosses += 1;
      } else {
        row2.matchWins += 1;
        row1.matchLosses += 1;
      }
    }
  }

  for (const row of rows.values()) row.pointDiff = row.pointsFor - row.pointsAgainst;

  return groupOrder.flatMap((group) =>
    rankGroup([...rows.values()].filter((row) => row.group === group))
  );
}
