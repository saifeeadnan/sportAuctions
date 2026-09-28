import { describe, it, expect } from "vitest";
import { computeMatchResult, computeStandings, type PickleballMatchForStandings } from "@/lib/pickleball/standings";

const game = (gameNumber: number, team1Score: number | null, team2Score: number | null) => ({
  gameNumber,
  team1Score,
  team2Score,
});

const match = (
  overrides: Partial<PickleballMatchForStandings> & Pick<PickleballMatchForStandings, "id" | "team1Id" | "team2Id">
): PickleballMatchForStandings => ({ gamesToPlay: 3, games: [], ...overrides });

describe("computeMatchResult", () => {
  it("is not decided until a side reaches the games needed to win", () => {
    const m = match({ id: "m1", team1Id: "A", team2Id: "B", games: [game(1, 11, 5)] });
    const result = computeMatchResult(m);
    expect(result.isDecided).toBe(false);
    expect(result.winnerId).toBeNull();
    expect(result.team1GamesWon).toBe(1);
    expect(result.team1Points).toBe(11);
    expect(result.team2Points).toBe(5);
  });

  it("is decided at 2 games won in a best-of-3, regardless of a still-unplayed third game", () => {
    const m = match({
      id: "m1",
      team1Id: "A",
      team2Id: "B",
      games: [game(1, 11, 5), game(2, 11, 8), game(3, null, null)],
    });
    const result = computeMatchResult(m);
    expect(result.isDecided).toBe(true);
    expect(result.winnerId).toBe("A");
    expect(result.team1GamesWon).toBe(2);
    expect(result.team2GamesWon).toBe(0);
  });

  it("scales games-needed-to-win to gamesToPlay (best-of-5 needs 3)", () => {
    const m = match({
      id: "m1",
      team1Id: "A",
      team2Id: "B",
      gamesToPlay: 5,
      games: [game(1, 11, 5), game(2, 11, 8)],
    });
    expect(computeMatchResult(m).isDecided).toBe(false);
    const decided = match({
      id: "m1",
      team1Id: "A",
      team2Id: "B",
      gamesToPlay: 5,
      games: [game(1, 11, 5), game(2, 11, 8), game(3, 11, 9)],
    });
    expect(computeMatchResult(decided).isDecided).toBe(true);
    expect(computeMatchResult(decided).winnerId).toBe("A");
  });

  it("skips a game with a missing score on either side", () => {
    const m = match({ id: "m1", team1Id: "A", team2Id: "B", games: [game(1, 11, null), game(2, 11, 7)] });
    const result = computeMatchResult(m);
    expect(result.team1GamesWon).toBe(1);
    expect(result.team1Points).toBe(11);
    expect(result.team2Points).toBe(7);
  });
});

describe("computeStandings", () => {
  const teams = [
    { teamId: "A", group: "A" },
    { teamId: "B", group: "A" },
    { teamId: "C", group: "A" },
    { teamId: "D", group: "B" },
  ];

  it("lists every team even with zero matches played", () => {
    const standings = computeStandings(teams, []);
    expect(standings).toHaveLength(4);
    const c = standings.find((r) => r.teamId === "C")!;
    expect(c).toMatchObject({ matchesPlayed: 0, matchWins: 0, gamesWon: 0, pointsFor: 0, rank: 1 });
  });

  it("ranks by match wins, then games won, then point diff — Excel's own tie-break order", () => {
    const matches: PickleballMatchForStandings[] = [
      // A beats B 2-0 (11-5, 11-6): A pointDiff +11
      match({ id: "m1", team1Id: "A", team2Id: "B", games: [game(1, 11, 5), game(2, 11, 6)] }),
      // C beats B 2-1 (11-5, 9-11, 11-2): C pointDiff +13, both A and C are 1-0 with 2 games won —
      // C's larger point diff must rank it above A.
      match({ id: "m2", team1Id: "B", team2Id: "C", games: [game(1, 5, 11), game(2, 11, 9), game(3, 2, 11)] }),
    ];
    const standings = computeStandings(teams, matches);
    const group = standings.filter((r) => r.group === "A");
    const a = group.find((r) => r.teamId === "A")!;
    const c = group.find((r) => r.teamId === "C")!;
    const b = group.find((r) => r.teamId === "B")!;
    expect(a).toMatchObject({ matchWins: 1, gamesWon: 2, pointDiff: 11, rank: 2 });
    expect(c).toMatchObject({ matchWins: 1, gamesWon: 2, pointDiff: 13, rank: 1 });
    expect(b).toMatchObject({ matchWins: 0, matchesPlayed: 2, rank: 3 });
  });

  it("gives tied teams the same rank and skips the next rank by the number tied (1, 1, 3)", () => {
    const threeTeams = [
      { teamId: "A", group: "A" },
      { teamId: "B", group: "A" },
      { teamId: "C", group: "A" },
    ];
    // A and B each win their only match 2-0 by an identical margin; C loses both.
    const matches: PickleballMatchForStandings[] = [
      match({ id: "m1", team1Id: "A", team2Id: "C", games: [game(1, 11, 5), game(2, 11, 5)] }),
      match({ id: "m2", team1Id: "B", team2Id: "C", games: [game(1, 11, 5), game(2, 11, 5)] }),
    ];
    const standings = computeStandings(threeTeams, matches);
    const byId = Object.fromEntries(standings.map((r) => [r.teamId, r]));
    expect(byId.A.rank).toBe(1);
    expect(byId.B.rank).toBe(1);
    expect(byId.C.rank).toBe(3);
  });

  it("counts games/points from an in-progress match's completed games, but not toward matchesPlayed/wins/losses", () => {
    const matches: PickleballMatchForStandings[] = [
      match({ id: "m1", team1Id: "A", team2Id: "B", games: [game(1, 11, 5)] }),
    ];
    const standings = computeStandings(teams, matches);
    const a = standings.find((r) => r.teamId === "A")!;
    expect(a.gamesWon).toBe(1);
    expect(a.pointsFor).toBe(11);
    expect(a.matchesPlayed).toBe(0);
    expect(a.matchWins).toBe(0);
  });

  it("groups are independent — a group-B team's standing never depends on group A's matches", () => {
    const matches: PickleballMatchForStandings[] = [
      match({ id: "m1", team1Id: "A", team2Id: "B", games: [game(1, 11, 5), game(2, 11, 6)] }),
    ];
    const standings = computeStandings(teams, matches);
    const d = standings.find((r) => r.teamId === "D")!;
    expect(d).toMatchObject({ matchesPlayed: 0, rank: 1 });
  });
});
