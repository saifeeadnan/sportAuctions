import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/services/apiClient";
import { formatCalendarDate } from "@/lib/dates";
import type { RatedPlayer } from "@/lib/teamStrength";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Collapsible } from "@/components/Collapsible";
import { TeamStrengthSummary } from "@/components/TeamStrengthSummary";
import { RosterRibbon } from "@/components/RosterRibbon";
import { SponsorRibbon } from "@/components/SponsorRibbon";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type PoolPlayer = RatedPlayer & {
  id: string;
  name: string;
  photoUrl: string | null;
  categoryName: string;
  status: string;
  price: string;
};

type FantasyTeamResponse =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      selfAuctionPlayerId: string;
      locked: boolean;
      lockDate: string;
      budget: string;
      cap: number;
      pool: PoolPlayer[];
      team: { picks: { auctionPlayer: { id: string } }[]; name: string | null } | null;
      auctionName: string;
      tournamentName: string;
      leagueName: string;
    };

function formatAmount(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function FantasyBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const theme = useTheme();

  const { data, isLoading, error } = useQuery({
    queryKey: ["fantasy-team", id],
    queryFn: () => apiFetch<FantasyTeamResponse>(`/api/mobile/auctions/${id}/fantasy-team`),
  });

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("");

  const initialized = useMemo(() => {
    if (!data?.eligible || selected != null) return selected;
    const fromTeam = data.team?.picks.map((p) => p.auctionPlayer.id) ?? [];
    return new Set([data.selfAuctionPlayerId, ...fromTeam]);
  }, [data, selected]);

  const mutation = useMutation({
    mutationFn: (auctionPlayerIds: string[]) =>
      apiFetch(`/api/mobile/auctions/${id}/fantasy-team`, {
        method: "POST",
        body: JSON.stringify({ auctionPlayerIds, name: (name ?? "").trim() || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fantasy-team", id] });
      queryClient.invalidateQueries({ queryKey: ["fantasy-teams"] });
      Alert.alert("Saved", "Your fantasy team has been saved.");
    },
    onError: (e) => Alert.alert("Couldn't save", e instanceof Error ? e.message : "Something went wrong"),
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
        <ThemedText themeColor="danger">Couldn't load this fantasy team.</ThemedText>
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
  if (data.locked) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">Fantasy submissions are closed for this auction.</ThemedText>
      </ThemedView>
    );
  }

  // A plain `const` capture so the nested functions below close over a type
  // already narrowed to the `eligible: true` variant — TS doesn't carry
  // control-flow narrowing of `data` itself into nested function
  // declarations, only into code in the same scope as the narrowing check.
  const eligible = data;
  const selectedIds = initialized ?? new Set([eligible.selfAuctionPlayerId]);
  const budgetTotal = Number(eligible.budget);
  const totalPrice = eligible.pool.filter((p) => selectedIds.has(p.id)).reduce((sum, p) => sum + Number(p.price), 0);
  const budgetLeft = budgetTotal - totalPrice;

  const priceByCategory = new Map<string, number>();
  for (const p of eligible.pool) {
    if (!priceByCategory.has(p.categoryName)) priceByCategory.set(p.categoryName, Number(p.price));
  }
  const categories = Array.from(priceByCategory.keys()).sort(
    (a, b) => (priceByCategory.get(b) ?? 0) - (priceByCategory.get(a) ?? 0)
  );
  const effectiveCategory = activeCategory && categories.includes(activeCategory) ? activeCategory : (categories[0] ?? "");
  const visiblePlayers = eligible.pool.filter((p) => p.categoryName === effectiveCategory);
  const teamSoFar: RatedPlayer[] = eligible.pool.filter((p) => selectedIds.has(p.id));

  function toggle(player: PoolPlayer) {
    if (player.id === eligible.selfAuctionPlayerId) return; // always force-included
    setSelected((prev) => {
      const next = new Set(prev ?? selectedIds);
      if (next.has(player.id)) {
        next.delete(player.id);
        return next;
      }
      if (next.size >= eligible.cap) return prev ?? selectedIds;
      if (player.status !== "SOLD") return prev ?? selectedIds;
      const currentTotal = eligible.pool.filter((p) => next.has(p.id)).reduce((sum, p) => sum + Number(p.price), 0);
      if (currentTotal + Number(player.price) > budgetTotal) return prev ?? selectedIds;
      next.add(player.id);
      return next;
    });
  }

  function handleSubmit() {
    const ids = Array.from(selectedIds);
    if (ids.length < eligible.cap) {
      Alert.alert("Save with fewer picks?", `Your fantasy team has ${ids.length} of ${eligible.cap} players. Save it anyway?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Save", onPress: () => mutation.mutate(ids) },
      ]);
    } else {
      mutation.mutate(ids);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ThemedText type="small" themeColor="textSecondary">
        {eligible.leagueName} / {eligible.tournamentName} / {eligible.auctionName}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Editable until <ThemedText type="smallBold" themeColor="accent">{formatCalendarDate(eligible.lockDate)}</ThemedText>
      </ThemedText>

      <TextInput
        placeholder="Team name (optional)"
        placeholderTextColor={theme.textSecondary}
        defaultValue={eligible.team?.name ?? ""}
        onChangeText={setName}
        maxLength={60}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
      />

      <ThemedText type="small">
        Budget: {eligible.budget} · Used: {formatAmount(totalPrice)} · Left:{" "}
        <ThemedText type="smallBold" themeColor={budgetLeft < 0 ? "danger" : "text"}>
          {formatAmount(budgetLeft)}
        </ThemedText>
      </ThemedText>

      <Collapsible title="Build" defaultOpen>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {categories.map((cat) => {
            const selectedInCategory = eligible.pool.filter((p) => p.categoryName === cat && selectedIds.has(p.id)).length;
            const totalInCategory = eligible.pool.filter((p) => p.categoryName === cat).length;
            const isActive = effectiveCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[
                  styles.tab,
                  { borderColor: theme.border },
                  isActive && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
              >
                <ThemedText type="small" style={isActive ? { color: theme.accentText, fontWeight: "700" } : undefined}>
                  {cat} ({selectedInCategory}/{totalInCategory})
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View>
          {visiblePlayers.map((p) => {
            const isPicked = selectedIds.has(p.id);
            const isLocked = p.id === eligible.selfAuctionPlayerId;
            const isUnsold = p.status !== "SOLD";
            const wouldExceedCap = !isPicked && selectedIds.size >= eligible.cap;
            const wouldExceedBudget = !isPicked && totalPrice + Number(p.price) > budgetTotal;
            const disabled = isLocked || (!isPicked && (wouldExceedCap || wouldExceedBudget || isUnsold));

            return (
              <Pressable key={p.id} disabled={disabled} onPress={() => toggle(p)}>
                <View style={[styles.playerRow, { borderBottomColor: theme.border }]}>
                  {isPicked ? (
                    <Ionicons name="checkbox" size={20} color={theme.accent} />
                  ) : (
                    <Ionicons name="square-outline" size={20} color={disabled ? theme.border : theme.textSecondary} />
                  )}
                  <View style={styles.playerRowText}>
                    <ThemedText type="small" numberOfLines={1}>
                      {p.name}
                      {p.position ? ` (${p.position})` : ""}
                      {isLocked ? " — you (always included)" : ""}
                    </ThemedText>
                  </View>
                  <Badge tone={p.status === "SOLD" ? "success" : "neutral"}>{p.status === "SOLD" ? "Sold" : "Unsold"}</Badge>
                  <ThemedText type="small" themeColor="textSecondary">
                    {p.price}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Button onPress={handleSubmit} loading={mutation.isPending}>
          Save fantasy team
        </Button>
      </Collapsible>

      <Collapsible title={`Current team (${selectedIds.size})`}>
        <TeamStrengthSummary players={teamSoFar} squadSize={eligible.cap} />
        <RosterRibbon
          grid
          highlightId={eligible.selfAuctionPlayerId}
          players={eligible.pool
            .filter((p) => selectedIds.has(p.id))
            .map((p) => ({ id: p.id, playerName: p.name, photoUrl: p.photoUrl, position: p.position, soldPrice: p.price }))}
        />
      </Collapsible>

      <SponsorRibbon auctionId={id} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.four },
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    fontSize: 16,
  },
  tabRow: { gap: Spacing.one, paddingBottom: Spacing.one },
  tab: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: Radius.pill, borderWidth: 1 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playerRowText: { flex: 1 },
});
