import { computeTeamStrength, type RatedPlayer } from "@/lib/teamStrength";

export function TeamStrengthSummary({ players }: { players: RatedPlayer[] }) {
  const { positionCounts, avgSkill, balance, teamStrength } = computeTeamStrength(players);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-black/60 dark:text-white/60">
        Team — Batsmen: {positionCounts.Batsmen} &middot; Bowlers: {positionCounts.Bowlers}{" "}
        &middot; All-rounders: {positionCounts["All-rounders"]}
        {positionCounts.Other > 0 ? ` · Other: ${positionCounts.Other}` : ""}
      </p>
      <p className="text-sm">
        Team strength: <span className="font-medium">{teamStrength.toFixed(1)} / 10</span>{" "}
        <span className="text-black/60 dark:text-white/60">
          (avg skill {avgSkill.toFixed(1)} &middot; balance {Math.round(balance * 100)}%)
        </span>
      </p>
    </div>
  );
}
