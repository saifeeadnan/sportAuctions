import { View } from "react-native";
import { computeTeamStrength, type RatedPlayer } from "@/lib/teamStrength";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

/** Mirrors components/manager/TeamStrengthSummary.tsx exactly (same
 * computeTeamStrength call, same "not enough players yet" hold-back). */
export function TeamStrengthSummary({ players, squadSize }: { players: RatedPlayer[]; squadSize: number }) {
  const { positionCounts, avgSkill, balance, teamStrength } = computeTeamStrength(players);
  const enoughPlayersForStrength = players.length * 2 >= squadSize;

  return (
    <View style={{ gap: Spacing.half }}>
      <ThemedText type="small" themeColor="textSecondary">
        Batsmen: {positionCounts.Batsmen} · Bowlers: {positionCounts.Bowlers} · All-rounders:{" "}
        {positionCounts["All-rounders"]}
        {positionCounts.Other > 0 ? ` · Other: ${positionCounts.Other}` : ""}
      </ThemedText>
      {enoughPlayersForStrength ? (
        <ThemedText type="small">
          Team strength: {teamStrength.toFixed(1)} / 10 (avg skill {avgSkill.toFixed(1)} · balance{" "}
          {Math.round(balance * 100)}%)
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Team strength available once you have at least {Math.ceil(squadSize / 2)} of {squadSize} players.
        </ThemedText>
      )}
    </View>
  );
}
