import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/services/apiClient";
import { formatDateTime } from "@/lib/dates";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/Card";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type SeedingRosterItem = {
  rosterId: string;
  rosterName: string;
  leagueName: string;
  status: "scheduled" | "open" | "closed" | "finalized";
  opensAt: string;
  closesAt: string;
  ratedCount: number;
  ratableCount: number;
};

function statusBadge(item: SeedingRosterItem): { tone: BadgeTone; label: string } {
  switch (item.status) {
    case "scheduled":
      return { tone: "neutral", label: `Opens ${formatDateTime(item.opensAt)}` };
    case "open": {
      const complete = item.ratableCount > 0 && item.ratedCount >= item.ratableCount;
      return { tone: complete ? "success" : "accent", label: `Rated ${item.ratedCount}/${item.ratableCount}` };
    }
    case "closed":
      return { tone: "neutral", label: "Closed" };
    case "finalized":
      return { tone: "success", label: "Published" };
  }
}

export default function RateScreen() {
  const theme = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["seeding-rosters"],
    queryFn: () => apiFetch<SeedingRosterItem[]>("/api/mobile/seeding"),
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ThemedText type="title" style={styles.heading}>
        Rate players
      </ThemedText>

      {isLoading && <ActivityIndicator style={styles.spinner} color={theme.accent} />}
      {error && (
        <ThemedText type="small" themeColor="danger">
          Couldn't load your rating rosters.
        </ThemedText>
      )}

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.rosterId}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !isLoading ? (
            <ThemedText themeColor="textSecondary">
              No rating windows are open for you right now.
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => {
          const badge = statusBadge(item);
          return (
            <Pressable onPress={() => router.push(`/seeding/${item.rosterId}`)}>
              <Card style={styles.row}>
                <View style={styles.rowText}>
                  <ThemedText type="smallBold">{item.rosterName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.leagueName}
                  </ThemedText>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </Card>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.three },
  heading: { fontSize: 28, lineHeight: 34, marginBottom: Spacing.three },
  spinner: { marginTop: Spacing.four },
  list: { gap: Spacing.two, paddingBottom: Spacing.five },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowText: { gap: Spacing.one, flex: 1 },
});
