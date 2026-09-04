/** Appends the sidebar's `?league=` filter (if any) onto an internal admin
 * link, so navigating deeper into a tournament/auction/roster doesn't
 * silently drop it — losing it resets ActiveLeagueBanner/AdminTabs to "All
 * leagues" until the user re-picks the league from the sidebar. Mirrors
 * AdminTabs.tsx's own `withLeague` (a client-side hook version of the same
 * idea); this is the plain-value version server components can call with
 * their own `searchParams.league`. */
export function withLeagueParam(href: string, leagueId: string | undefined | null): string {
  if (!leagueId) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}league=${leagueId}`;
}
