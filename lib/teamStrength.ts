export type RatedPlayer = {
  position: string | null;
  rating: string | null;
  battingRating: string | null;
  bowlingRating: string | null;
  fieldingRating: string | null;
};

export type PositionGroup = "Batsmen" | "Bowlers" | "All-rounders" | "Other";
export const POSITION_GROUPS: PositionGroup[] = ["Batsmen", "Bowlers", "All-rounders", "Other"];

export function groupPosition(position: string | null): PositionGroup {
  const normalized = (position ?? "").toLowerCase().replace(/[\s-]/g, "");
  if (normalized === "batsman" || normalized === "batsmen") return "Batsmen";
  if (normalized === "bowler" || normalized === "bowlers") return "Bowlers";
  if (normalized === "allrounder" || normalized === "allrounders") return "All-rounders";
  return "Other";
}

// Player ratings are a mix of scales: `rating` is out of 100 while the
// batting/bowling/fielding sub-ratings are out of 10 — normalize `rating`
// down to /10 so scores stay comparable regardless of which fields a
// given player happens to have filled in.
export function skillScore(p: RatedPlayer): number {
  const group = groupPosition(p.position);
  const overall = p.rating != null ? Number(p.rating) / 10 : null;
  const batting = p.battingRating != null ? Number(p.battingRating) : null;
  const bowling = p.bowlingRating != null ? Number(p.bowlingRating) : null;
  const fielding = p.fieldingRating != null ? Number(p.fieldingRating) : null;

  let primary: number | null;
  if (group === "Batsmen") {
    primary = batting ?? overall;
  } else if (group === "Bowlers") {
    primary = bowling ?? overall;
  } else if (group === "All-rounders") {
    const parts = [batting, bowling].filter((v): v is number => v != null);
    primary = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : overall;
  } else {
    primary = overall;
  }

  // Fielding is weighted equally alongside the position-relevant rating(s),
  // not just a minor bonus — a great fielder meaningfully lifts the score.
  const components = [primary, fielding].filter((v): v is number => v != null);
  return components.length > 0 ? components.reduce((a, b) => a + b, 0) / components.length : 0;
}

// Rewards a squad mix close to an all-rounder-heavy but balanced XI; penalizes
// squads that are lopsided (e.g. all batsmen, no bowlers).
const TARGET_POSITION_RATIO: Record<PositionGroup, number> = {
  Batsmen: 0.3,
  Bowlers: 0.3,
  "All-rounders": 0.4,
  Other: 0,
};

function balanceMultiplier(counts: Record<PositionGroup, number>, total: number): number {
  if (total === 0) return 1;
  const deviation = POSITION_GROUPS.reduce(
    (sum, group) => sum + Math.abs(counts[group] / total - TARGET_POSITION_RATIO[group]),
    0
  );
  return Math.max(0.6, Math.min(1, 1 - deviation * 0.2));
}

export function computeTeamStrength(players: RatedPlayer[]) {
  const positionCounts = POSITION_GROUPS.reduce(
    (acc, group) => ({ ...acc, [group]: 0 }),
    {} as Record<PositionGroup, number>
  );
  for (const p of players) {
    positionCounts[groupPosition(p.position)] += 1;
  }

  const avgSkill =
    players.length > 0
      ? players.reduce((sum, p) => sum + skillScore(p), 0) / players.length
      : 0;
  const balance = balanceMultiplier(positionCounts, players.length);
  const teamStrength = avgSkill * balance;

  return { positionCounts, avgSkill, balance, teamStrength };
}
