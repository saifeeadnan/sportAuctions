import { describe, it, expect } from "vitest";
import { validatePickleballSchedule } from "@/lib/pickleballSchedule/schema";

const validTeamIds = new Set(["t1", "t2", "t3", "t4"]);
const baseTeams = [
  { teamId: "t1", group: "A" },
  { teamId: "t2", group: "A" },
  { teamId: "t3", group: "B" },
  { teamId: "t4", group: "B" },
];
const baseMatch = { matchNumber: 1, round: "1", court: null, group: "A", team1Id: "t1", team2Id: "t2", gamesToPlay: 3 };

function run(teams: unknown, matches: unknown) {
  return validatePickleballSchedule({ teams, matches }, { validTeamIds });
}

describe("validatePickleballSchedule", () => {
  it("accepts a valid schedule and trims strings", () => {
    const result = run(baseTeams, [{ ...baseMatch, round: "  1  ", court: "  Court 2  " }]);
    expect(result.teams).toEqual(baseTeams);
    expect(result.matches[0]).toMatchObject({ round: "1", court: "Court 2" });
  });

  it("treats a blank court as no court", () => {
    const result = run(baseTeams, [{ ...baseMatch, court: "" }]);
    expect(result.matches[0].court).toBeNull();
  });

  it("rejects an empty team or match list", () => {
    expect(() => run([], [baseMatch])).toThrow("at least one team");
    expect(() => run(baseTeams, [])).toThrow("at least one match");
  });

  it("rejects a team not in the tournament", () => {
    expect(() => run([{ teamId: "unknown", group: "A" }], [baseMatch])).toThrow("not part of this tournament");
  });

  it("rejects the same team listed twice", () => {
    expect(() => run([...baseTeams, { teamId: "t1", group: "A" }], [baseMatch])).toThrow("listed twice");
  });

  it("rejects a blank team group", () => {
    expect(() => run([{ teamId: "t1", group: "  " }], [baseMatch])).toThrow("no group");
  });

  it("rejects a duplicate match number", () => {
    expect(() => run(baseTeams, [baseMatch, { ...baseMatch, matchNumber: 1 }])).toThrow("used twice");
  });

  it("rejects a team playing itself", () => {
    expect(() => run(baseTeams, [{ ...baseMatch, team2Id: "t1" }])).toThrow("can't play itself");
  });

  it("rejects a match team not in the schedule's team list", () => {
    expect(() => run(baseTeams, [{ ...baseMatch, team1Id: "unlisted", team2Id: "t2" }])).toThrow(
      "isn't in this schedule's team list"
    );
  });

  it("rejects a match whose teams aren't both in the match's own group", () => {
    // t3 is in group B, so a group-A match can't use it
    expect(() => run(baseTeams, [{ ...baseMatch, team1Id: "t3", team2Id: "t2" }])).toThrow("must be in group A");
  });

  it("rejects gamesToPlay outside [1, 15]", () => {
    expect(() => run(baseTeams, [{ ...baseMatch, gamesToPlay: 0 }])).toThrow("between 1 and 15");
    expect(() => run(baseTeams, [{ ...baseMatch, gamesToPlay: 16 }])).toThrow("between 1 and 15");
    expect(() => run(baseTeams, [{ ...baseMatch, gamesToPlay: 2.5 }])).toThrow("between 1 and 15");
  });

  it("rejects a blank round or match group", () => {
    expect(() => run(baseTeams, [{ ...baseMatch, round: "" }])).toThrow("no round");
    expect(() => run(baseTeams, [{ ...baseMatch, group: "" }])).toThrow("no group");
  });

  it("rejects a non-positive or non-integer match number", () => {
    expect(() => run(baseTeams, [{ ...baseMatch, matchNumber: 0 }])).toThrow("positive whole number");
    expect(() => run(baseTeams, [{ ...baseMatch, matchNumber: 1.5 }])).toThrow("positive whole number");
  });
});
