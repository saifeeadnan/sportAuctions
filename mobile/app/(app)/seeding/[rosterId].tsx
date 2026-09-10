import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/services/apiClient";
import { formatDateTime } from "@/lib/dates";
import type { PositionGroup } from "@/lib/teamStrength";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Collapsible } from "@/components/Collapsible";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type SheetPlayer = {
  playerId: string;
  name: string;
  position: string | null;
  photoUrl: string | null;
  positionGroup: PositionGroup;
  mySeed: number | null;
};
type FinalRow = { seed: number; playerId: string; name: string; position: string | null };

type SheetResponse =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      status: "scheduled" | "open" | "closed";
      rosterName: string;
      leagueName: string;
      opensAt: string;
      closesAt: string;
      maxSeed: number;
      players: SheetPlayer[];
    }
  | {
      eligible: true;
      status: "finalized";
      rosterName: string;
      leagueName: string;
      selfPlayerId: string;
      finalSeeding: FinalRow[];
    };

const GROUP_ORDER: PositionGroup[] = ["Batsmen", "Bowlers", "All-rounders", "Other"];

export default function SeedingDetailScreen() {
  const { rosterId } = useLocalSearchParams<{ rosterId: string }>();
  const theme = useTheme();

  const { data, isLoading, error } = useQuery({
    queryKey: ["seeding", rosterId],
    queryFn: () => apiFetch<SheetResponse>(`/api/mobile/rosters/${rosterId}/seeding`),
  });

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.accent} />
      </ThemedView>
    );
  }
  if (error || !data) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="danger">Couldn't load this rating page.</ThemedText>
      </ThemedView>
    );
  }
  if (!data.eligible) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">{data.reason}</ThemedText>
      </ThemedView>
    );
  }
  if (data.status === "scheduled") {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">
          Rating opens {formatDateTime(data.opensAt)}.
        </ThemedText>
      </ThemedView>
    );
  }
  if (data.status === "closed") {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">
          Rating closed on {formatDateTime(data.closesAt)}. The admin is finalizing the seeding — check
          back soon.
        </ThemedText>
      </ThemedView>
    );
  }
  if (data.status === "finalized") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          {data.leagueName} / {data.rosterName}
        </ThemedText>
        <ThemedText type="title" style={styles.title}>
          Final seeding
        </ThemedText>
        {data.finalSeeding.map((row) => (
          <Card key={row.playerId} style={styles.finalRow}>
            <ThemedText type="smallBold" style={styles.finalSeed}>
              #{row.seed}
            </ThemedText>
            <ThemedText type="small" style={styles.finalName}>
              {row.name}
              {row.position ? ` (${row.position})` : ""}
            </ThemedText>
            {row.playerId === data.selfPlayerId && <Badge tone="accent">You</Badge>}
          </Card>
        ))}
      </ScrollView>
    );
  }

  // status === "open"
  return (
    <RatingEditor
      rosterId={rosterId}
      leagueName={data.leagueName}
      rosterName={data.rosterName}
      closesAt={data.closesAt}
      maxSeed={data.maxSeed}
      players={data.players}
    />
  );
}

function RatingEditor({
  rosterId,
  leagueName,
  rosterName,
  closesAt,
  maxSeed,
  players,
}: {
  rosterId: string;
  leagueName: string;
  rosterName: string;
  closesAt: string;
  maxSeed: number;
  players: SheetPlayer[];
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [seeds, setSeeds] = useState<Map<string, number | null>>(
    new Map(players.map((p) => [p.playerId, p.mySeed]))
  );

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(`/api/mobile/rosters/${rosterId}/seeding`, {
        method: "POST",
        body: JSON.stringify({
          seeds: Array.from(seeds.entries())
            .filter((e): e is [string, number] => e[1] != null)
            .map(([playerId, seed]) => ({ playerId, seed })),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seeding", rosterId] });
      queryClient.invalidateQueries({ queryKey: ["seeding-rosters"] });
      Alert.alert("Saved", "Your ratings have been saved.");
    },
    onError: (e) => Alert.alert("Couldn't save", e instanceof Error ? e.message : "Something went wrong"),
  });

  function setSeed(playerId: string, value: number | null) {
    setSeeds((prev) => {
      const next = new Map(prev);
      next.set(playerId, value);
      return next;
    });
  }

  const groups = GROUP_ORDER.filter((g) => players.some((p) => p.positionGroup === g));
  const ratedCount = Array.from(seeds.values()).filter((v) => v != null).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ThemedText type="small" themeColor="textSecondary">
        {leagueName} / {rosterName}
      </ThemedText>
      <ThemedText type="small">
        Seed each player 1 (best) to {maxSeed}, tap again to clear. Anonymous — you can change your
        answers until{" "}
        <ThemedText type="smallBold" themeColor="accent">
          {formatDateTime(closesAt)}
        </ThemedText>
        .
      </ThemedText>

      {groups.map((group) => (
        <Collapsible key={group} title={group} defaultOpen>
          {players
            .filter((p) => p.positionGroup === group)
            .map((p) => (
              <View key={p.playerId} style={styles.playerBlock}>
                <ThemedText type="small" numberOfLines={1}>
                  {p.name}
                  {p.position ? ` (${p.position})` : ""}
                </ThemedText>
                <View style={styles.chipsRow}>
                  {Array.from({ length: maxSeed }, (_, i) => i + 1).map((n) => {
                    const selected = seeds.get(p.playerId) === n;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setSeed(p.playerId, selected ? null : n)}
                        style={[
                          styles.chip,
                          { borderColor: theme.border },
                          selected && { backgroundColor: theme.accent, borderColor: theme.accent },
                        ]}
                      >
                        <ThemedText type="label" style={selected ? { color: theme.accentText } : undefined}>
                          {n}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
        </Collapsible>
      ))}

      <ThemedText type="small" themeColor="textSecondary">
        {ratedCount} of {players.length} rated
      </ThemedText>
      <Button onPress={() => mutation.mutate()} loading={mutation.isPending}>
        Save ratings
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.four },
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  title: { fontSize: 24, lineHeight: 30 },
  finalRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  finalSeed: { minWidth: 32 },
  finalName: { flex: 1 },
  playerBlock: { gap: Spacing.one, marginBottom: Spacing.two },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.one },
  chip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
