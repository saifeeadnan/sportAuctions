import { computeTeamStrength, type RatedPlayer } from "@/lib/teamStrength";

export function TeamStrengthSummary({
  players,
  squadSize,
}: {
  players: RatedPlayer[];
  squadSize: number;
}) {
  const { positionCounts, avgSkill, balance, teamStrength } = computeTeamStrength(players);
  // A per-player average is dominated by one or two picks' ratings early on,
  // reading as more meaningful than it is — hold the number back until at
  // least half the squad is filled.
  const enoughPlayersForStrength = players.length * 2 >= squadSize;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-black/60 dark:text-white/60">
        Team — Batsmen: {positionCounts.Batsmen} &middot; Bowlers: {positionCounts.Bowlers}{" "}
        &middot; All-rounders: {positionCounts["All-rounders"]}
        {positionCounts.Other > 0 ? ` · Other: ${positionCounts.Other}` : ""}
      </p>
      {enoughPlayersForStrength ? (
        <p className="text-sm">
          Team strength: <span className="font-medium">{teamStrength.toFixed(1)} / 10</span>{" "}
          <span className="text-black/60 dark:text-white/60">
            (avg skill {avgSkill.toFixed(1)} &middot; balance {Math.round(balance * 100)}%)
          </span>
        </p>
      ) : (
        <p className="text-sm text-black/50 dark:text-white/50">
          Team strength available once you have at least {Math.ceil(squadSize / 2)} of {squadSize}{" "}
          players.
        </p>
      )}
    </div>
  );
}
