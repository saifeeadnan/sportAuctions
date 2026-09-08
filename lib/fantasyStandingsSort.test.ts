import { describe, it, expect } from "vitest";
import { assignCompetitionRanks } from "@/lib/fantasyStandingsSort";

const byNumber = (a: number, b: number) => a - b;

describe("assignCompetitionRanks", () => {
  it("shares a rank between tied items and skips the next rank (1, 1, 3)", () => {
    const ranked = assignCompetitionRanks(
      [
        { name: "a", pts: 10 },
        { name: "b", pts: 20 },
        { name: "c", pts: 20 },
        { name: "d", pts: 5 },
      ],
      (t) => t.pts,
      byNumber
    );
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ["b", 1],
      ["c", 1],
      ["a", 3],
      ["d", 4],
    ]);
  });

  it("keeps the input order among tied items (stable) — submission order breaks display ties", () => {
    const ranked = assignCompetitionRanks(
      [
        { name: "second", pts: 7 },
        { name: "first", pts: 7 },
        { name: "third", pts: 7 },
      ],
      (t) => t.pts,
      byNumber
    );
    expect(ranked.map((r) => r.name)).toEqual(["second", "first", "third"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1]);
  });

  it("returns an empty list unchanged and ranks a lone item #1", () => {
    expect(assignCompetitionRanks([], (t: { pts: number }) => t.pts, byNumber)).toEqual([]);
    expect(assignCompetitionRanks([{ pts: 0 }], (t) => t.pts, byNumber)).toEqual([{ pts: 0, rank: 1 }]);
  });

  it("does not mutate its input", () => {
    const input = [{ pts: 1 }, { pts: 2 }];
    assignCompetitionRanks(input, (t) => t.pts, byNumber);
    expect(input).toEqual([{ pts: 1 }, { pts: 2 }]);
  });
});
