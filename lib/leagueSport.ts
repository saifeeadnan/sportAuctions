/**
 * League.type is free text (placeholder: "Cricket, Soccer, Frisbee…" — see
 * LeaguesPanel.tsx), but the position-group breakdown and team-strength
 * score in lib/teamStrength.ts are inherently cricket concepts (Batsmen /
 * Bowlers / All-rounders, batting/bowling/fielding ratings). UI built on top
 * of that (TeamStrengthSummary and its call sites) should only render for a
 * league whose type resolves to Cricket.
 */
export function isCricketLeague(leagueType: string | null | undefined): boolean {
  return (leagueType ?? "").trim().toLowerCase() === "cricket";
}
