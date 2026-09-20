export type GridLayoutTier = {
  /** Square logo/placeholder size, px. */
  logoSize: number;
  /** Height of the name/budget header line(s), px. */
  headerHeight: number;
  /** Height of one player row, including its own small gap, px. */
  playerLineHeight: number;
  /** Total vertical padding + border inside a card, px. */
  cardPadding: number;
  /** Never make a card narrower than this, px. */
  minCardWidth: number;
};

// Tried largest (most readable) first. Each step down shrinks the logo and
// tightens line heights so more rows fit in the same height, and lowers
// minCardWidth so more (narrower) columns are tolerable — the two levers
// that actually relax the fit. Font size deliberately stays put as long as
// possible; a smaller logo hurts legibility less on a broadcast than
// shrinking text does.
export const GRID_LAYOUT_TIERS: GridLayoutTier[] = [
  { logoSize: 128, headerHeight: 24, playerLineHeight: 22, cardPadding: 28, minCardWidth: 320 },
  { logoSize: 96, headerHeight: 24, playerLineHeight: 22, cardPadding: 28, minCardWidth: 280 },
  { logoSize: 64, headerHeight: 22, playerLineHeight: 20, cardPadding: 24, minCardWidth: 240 },
  { logoSize: 48, headerHeight: 20, playerLineHeight: 18, cardPadding: 20, minCardWidth: 200 },
];

// Matches the grid's own gap-3.
export const GRID_GAP_PX = 12;

export type GridLayoutResult = {
  columns: number;
  tier: GridLayoutTier;
};

function cardHeightFor(tier: GridLayoutTier, maxPlayersPerCard: number): number {
  return Math.max(
    tier.logoSize + tier.cardPadding,
    tier.headerHeight + maxPlayersPerCard * tier.playerLineHeight + tier.cardPadding
  );
}

/**
 * Picks as many grid columns as the current tier's card width comfortably
 * allows (capped at `teamCount`) — the natural, evenly-spread layout, same
 * as what `auto-fit` would produce — as long as that still keeps every row
 * within `availableHeight`. Every card is sized off `maxPlayersPerCard`
 * (the roster with the most players), since CSS Grid rows are only as tall
 * as their tallest cell, so sizing off anything less would just move the
 * overflow to whichever row holds the biggest team. Only when even the
 * widest-comfortable column count still leaves too many rows does it fall
 * back to a smaller, more compact tier (see GRID_LAYOUT_TIERS) — a shorter
 * card AND a narrower width floor both relax the fit at once.
 */
export function computeGridLayout({
  teamCount,
  maxPlayersPerCard,
  availableWidth,
  availableHeight,
}: {
  teamCount: number;
  maxPlayersPerCard: number;
  availableWidth: number;
  availableHeight: number;
}): GridLayoutResult {
  if (teamCount <= 0) return { columns: 1, tier: GRID_LAYOUT_TIERS[0] };

  for (const tier of GRID_LAYOUT_TIERS) {
    const cardHeight = cardHeightFor(tier, maxPlayersPerCard);
    const maxRows = Math.max(1, Math.floor((availableHeight + GRID_GAP_PX) / (cardHeight + GRID_GAP_PX)));
    const maxColumnsByWidth = Math.max(
      1,
      Math.floor((availableWidth + GRID_GAP_PX) / (tier.minCardWidth + GRID_GAP_PX))
    );
    const columns = Math.min(teamCount, maxColumnsByWidth);
    const rows = Math.ceil(teamCount / columns);
    if (rows <= maxRows) {
      return { columns, tier };
    }
  }

  // Nothing fit height-wise at any tier (an extreme team/roster count) —
  // fit as many columns of the smallest tier's own minimum width as the
  // available width allows. Some vertical scrolling may still happen, but
  // this is the most columns this content can stay readable at.
  const smallest = GRID_LAYOUT_TIERS[GRID_LAYOUT_TIERS.length - 1];
  const columns = Math.max(
    1,
    Math.min(teamCount, Math.floor((availableWidth + GRID_GAP_PX) / (smallest.minCardWidth + GRID_GAP_PX)))
  );
  return { columns, tier: smallest };
}
