import { describe, it, expect } from "vitest";
import { computeRosterAffordability } from "./rosterAffordability";

describe("computeRosterAffordability", () => {
  it("computes budget remaining divided by slots to fill, sorted highest first", () => {
    const teams = [
      { id: "a", teamName: "A", budgetRemaining: "300", slotsFilled: 2, slotsTotal: 5 }, // 300/3 = 100
      { id: "b", teamName: "B", budgetRemaining: "400", slotsFilled: 3, slotsTotal: 5 }, // 400/2 = 200
      { id: "c", teamName: "C", budgetRemaining: "90", slotsFilled: 0, slotsTotal: 3 }, // 90/3 = 30
    ];

    const rows = computeRosterAffordability(teams, []);

    expect(rows.map((r) => r.teamId)).toEqual(["b", "a", "c"]);
    expect(rows[0].averageAffordability).toBe(200);
    expect(rows[0].slotsToFill).toBe(2);
  });

  it("marks a full roster (0 slots to fill) as null affordability and sorts it last", () => {
    const teams = [
      { id: "full", teamName: "Full", budgetRemaining: "50", slotsFilled: 5, slotsTotal: 5 },
      { id: "open", teamName: "Open", budgetRemaining: "10", slotsFilled: 4, slotsTotal: 5 }, // 10/1 = 10
    ];

    const rows = computeRosterAffordability(teams, []);

    expect(rows.map((r) => r.teamId)).toEqual(["open", "full"]);
    expect(rows[1].averageAffordability).toBeNull();
    expect(rows[1].slotsToFill).toBe(0);
  });

  it("treats slotsFilled overshooting slotsTotal as 0 slots to fill rather than negative", () => {
    const teams = [{ id: "a", teamName: "A", budgetRemaining: "50", slotsFilled: 6, slotsTotal: 5 }];
    const rows = computeRosterAffordability(teams, []);
    expect(rows[0].slotsToFill).toBe(0);
    expect(rows[0].averageAffordability).toBeNull();
  });

  it("counts each team's sold players per category, ordered highest base price first, zero-filled for categories a team hasn't bought into", () => {
    const teams = [
      { id: "a", teamName: "A", budgetRemaining: "300", slotsFilled: 2, slotsTotal: 5 },
      { id: "b", teamName: "B", budgetRemaining: "400", slotsFilled: 1, slotsTotal: 5 },
    ];
    const players = [
      { categoryName: "Gold", basePrice: "200", status: "SOLD", soldToEntryId: "a" },
      { categoryName: "Gold", basePrice: "200", status: "SOLD", soldToEntryId: "a" },
      { categoryName: "Silver", basePrice: "100", status: "SOLD", soldToEntryId: "b" },
      { categoryName: "Silver", basePrice: "100", status: "AVAILABLE", soldToEntryId: null },
      { categoryName: "Gold", basePrice: "200", status: "SOLD", soldToEntryId: null }, // unsold to a real team
    ];

    const rows = computeRosterAffordability(teams, players);
    const a = rows.find((r) => r.teamId === "a")!;
    const b = rows.find((r) => r.teamId === "b")!;

    expect(Object.keys(a.categoryCounts)).toEqual(["Gold", "Silver"]);
    expect(a.categoryCounts).toEqual({ Gold: 2, Silver: 0 });
    expect(b.categoryCounts).toEqual({ Gold: 0, Silver: 1 });
  });
});
