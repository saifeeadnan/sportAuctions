import { describe, it, expect } from "vitest";
import { seedingWindowStatus, computeSuggestedSeeding } from "@/lib/seeding";

describe("seedingWindowStatus", () => {
  const base = { opensAt: new Date("2026-01-10"), closesAt: new Date("2026-01-20"), finalizedAt: null };

  it("is scheduled before opensAt", () => {
    expect(seedingWindowStatus(base, new Date("2026-01-05"))).toBe("scheduled");
  });

  it("is open between opensAt and closesAt", () => {
    expect(seedingWindowStatus(base, new Date("2026-01-15"))).toBe("open");
  });

  it("is closed at or after closesAt", () => {
    expect(seedingWindowStatus(base, new Date("2026-01-20"))).toBe("closed");
    expect(seedingWindowStatus(base, new Date("2026-01-25"))).toBe("closed");
  });

  it("is finalized regardless of the dates once finalizedAt is set", () => {
    expect(seedingWindowStatus({ ...base, finalizedAt: new Date("2026-01-12") }, new Date("2026-01-15"))).toBe(
      "finalized"
    );
  });
});

describe("computeSuggestedSeeding", () => {
  const players = [
    { playerId: "a", name: "Alice" },
    { playerId: "b", name: "Bob" },
    { playerId: "c", name: "Cara" },
    { playerId: "d", name: "Dev" },
  ];

  it("orders rated players by average seed ascending (lower = better)", () => {
    const rows = computeSuggestedSeeding(players, [
      { playerId: "a", seed: 3 },
      { playerId: "b", seed: 1 },
      { playerId: "c", seed: 2 },
    ]);
    // d has no submissions and sorts last.
    expect(rows.map((r) => r.playerId)).toEqual(["b", "c", "a", "d"]);
    expect(rows.map((r) => r.suggestedSeed)).toEqual([1, 2, 3, 4]);
  });

  it("puts unrated players last, sorted by name", () => {
    const rows = computeSuggestedSeeding(players, [{ playerId: "a", seed: 5 }]);
    expect(rows.map((r) => r.playerId)).toEqual(["a", "b", "c", "d"]);
    expect(rows.slice(1).every((r) => r.avgSeed === null && r.ratingCount === 0)).toBe(true);
  });

  it("averages multiple submissions per player and rounds to 2dp", () => {
    const rows = computeSuggestedSeeding(
      [{ playerId: "a", name: "Alice" }],
      [
        { playerId: "a", seed: 1 },
        { playerId: "a", seed: 2 },
        { playerId: "a", seed: 2 },
      ]
    );
    expect(rows[0]).toMatchObject({ avgSeed: 1.67, ratingCount: 3 });
  });

  it("groups players with an identical 2dp average into the same tieGroup, and leaves untied players null", () => {
    const rows = computeSuggestedSeeding(players, [
      { playerId: "a", seed: 2 },
      { playerId: "b", seed: 2 },
      { playerId: "c", seed: 5 },
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    expect(byId.a.tieGroup).not.toBeNull();
    expect(byId.a.tieGroup).toBe(byId.b.tieGroup);
    expect(byId.c.tieGroup).toBeNull();
    expect(byId.d.tieGroup).toBeNull(); // unrated, never grouped
  });

  it("breaks a tie by player name, never by rating count", () => {
    // "Alice" (2 submissions) ties with "Bob" (1 submission) at avg 2 —
    // count must not influence order or grouping.
    const rows = computeSuggestedSeeding(
      [
        { playerId: "a", name: "Alice" },
        { playerId: "b", name: "Bob" },
      ],
      [
        { playerId: "a", seed: 1 },
        { playerId: "a", seed: 3 },
        { playerId: "b", seed: 2 },
      ]
    );
    expect(rows.map((r) => r.playerId)).toEqual(["a", "b"]); // alphabetical
    expect(rows[0].tieGroup).toBe(rows[1].tieGroup);
    expect(rows[0].ratingCount).toBe(2);
    expect(rows[1].ratingCount).toBe(1);
  });

  it("handles an empty roster and a roster with no submissions", () => {
    expect(computeSuggestedSeeding([], [])).toEqual([]);
    const rows = computeSuggestedSeeding(players, []);
    expect(rows.every((r) => r.avgSeed === null)).toBe(true);
    expect(rows.map((r) => r.suggestedSeed)).toEqual([1, 2, 3, 4]);
  });
});
