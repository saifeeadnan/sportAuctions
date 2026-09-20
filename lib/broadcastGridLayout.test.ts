import { describe, it, expect } from "vitest";
import { computeGridLayout, GRID_LAYOUT_TIERS } from "./broadcastGridLayout";

describe("computeGridLayout", () => {
  it("picks the fewest columns that still keep every row within the available height", () => {
    // A generous 1920x1080-ish canvas, 12 teams with up to 5 players each —
    // the exact scenario reported (12 teams, vertical scrollbar).
    const { columns, tier } = computeGridLayout({
      teamCount: 12,
      maxPlayersPerCard: 5,
      availableWidth: 1800,
      availableHeight: 700,
    });
    expect(tier).toBe(GRID_LAYOUT_TIERS[0]);
    const rows = Math.ceil(12 / columns);
    const cardHeight = tier.headerHeight + 5 * tier.playerLineHeight + tier.cardPadding;
    expect(rows * cardHeight + (rows - 1) * 12).toBeLessThanOrEqual(700);
  });

  it("reproduces the reported bug fix: 12 teams with full ~11-player rosters, typical OBS canvas leftover space", () => {
    // With the old fixed minmax(22rem) auto-fit, 12 teams would only ever
    // fit ~5 columns regardless of content, forcing 3 rows at full
    // (128px-logo) card height — comfortably taller than a realistic
    // ~700px leftover height, which is exactly the reported vertical
    // scrollbar. This should now degrade to a smaller logo tier and use
    // more columns instead, fitting cleanly.
    const { columns, tier } = computeGridLayout({
      teamCount: 12,
      maxPlayersPerCard: 11,
      availableWidth: 1800,
      availableHeight: 700,
    });
    const cardHeight = tier.headerHeight + 11 * tier.playerLineHeight + tier.cardPadding;
    const rows = Math.ceil(12 / columns);
    expect(rows * cardHeight + (rows - 1) * 12).toBeLessThanOrEqual(700);
    const columnWidth = (1800 - 12 * (columns - 1)) / columns;
    expect(columnWidth).toBeGreaterThanOrEqual(tier.minCardWidth - 0.01);
  });

  it("uses a single row when there's ample height for it", () => {
    const { columns } = computeGridLayout({
      teamCount: 4,
      maxPlayersPerCard: 3,
      availableWidth: 1800,
      availableHeight: 900,
    });
    expect(columns).toBe(4);
  });

  it("falls back to a smaller tier when the height-driven column count would make cards too narrow", () => {
    const { columns, tier } = computeGridLayout({
      teamCount: 24,
      maxPlayersPerCard: 15,
      availableWidth: 1400,
      availableHeight: 500,
    });
    expect(tier).not.toBe(GRID_LAYOUT_TIERS[0]);
    const columnWidth = (1400 - 12 * (columns - 1)) / columns;
    expect(columnWidth).toBeGreaterThanOrEqual(tier.minCardWidth - 0.01);
  });

  it("never returns more columns than there are teams", () => {
    const { columns } = computeGridLayout({
      teamCount: 3,
      maxPlayersPerCard: 1,
      availableWidth: 3000,
      availableHeight: 1000,
    });
    expect(columns).toBe(3);
  });

  it("returns 1 column for zero teams without dividing by zero", () => {
    const { columns } = computeGridLayout({
      teamCount: 0,
      maxPlayersPerCard: 0,
      availableWidth: 1000,
      availableHeight: 500,
    });
    expect(columns).toBe(1);
  });

  it("degrades gracefully (still returns a positive column count) in an extreme case nothing fits cleanly", () => {
    const { columns } = computeGridLayout({
      teamCount: 40,
      maxPlayersPerCard: 30,
      availableWidth: 800,
      availableHeight: 300,
    });
    expect(columns).toBeGreaterThan(0);
  });
});
