import { useMemo } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/services/apiClient";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/Card";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type MobileAuction = { id: string; name: string; status: string; tournamentId: string; tournamentName: string };
type Section = { title: string; data: MobileAuction[] };

function statusTone(status: string): BadgeTone {
  if (status === "BIDDING") return "live";
  if (status === "COMPLETED") return "success";
  return "neutral";
}

/** Groups auctions under the tournament they belong to — several auctions
 * can share one tournament, so a flat list with the tournament name buried
 * as a small subtitle on every row repeated it once per auction instead of
 * making it the heading it actually is. */
function groupByTournament(auctions: MobileAuction[]): Section[] {
  const order: string[] = [];
  const byTournament = new Map<string, MobileAuction[]>();
  for (const a of auctions) {
    if (!byTournament.has(a.tournamentId)) {
      byTournament.set(a.tournamentId, []);
      order.push(a.tournamentId);
    }
    byTournament.get(a.tournamentId)!.push(a);
  }
  return order.map((tournamentId) => {
    const list = byTournament.get(tournamentId)!;
    return { title: list[0].tournamentName, data: list };
  });
}

export default function AuctionsScreen() {
  const theme = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["auctions"],
    queryFn: () => apiFetch<MobileAuction[]>("/api/mobile/auctions"),
  });

  const sections = useMemo(() => groupByTournament(data ?? []), [data]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ThemedText type="title" style={styles.heading}>
        Auctions
      </ThemedText>

      {isLoading && <ActivityIndicator style={styles.spinner} color={theme.accent} />}
      {error && (
        <ThemedText type="small" themeColor="danger">
          Couldn't load auctions.
        </ThemedText>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          !isLoading ? <ThemedText themeColor="textSecondary">No auctions yet.</ThemedText> : null
        }
        renderSectionHeader={({ section }) => (
          <ThemedText type="label" themeColor="textSecondary" style={styles.sectionHeader}>
            {section.title}
          </ThemedText>
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/auctions/${item.id}`)}>
            <Card style={styles.row}>
              <ThemedText type="smallBold" style={styles.rowName}>
                {item.name}
              </ThemedText>
              <View style={styles.rowRight}>
                <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.three },
  heading: { fontSize: 28, lineHeight: 34, marginBottom: Spacing.three },
  spinner: { marginTop: Spacing.four },
  list: { gap: Spacing.two, paddingBottom: Spacing.five },
  sectionHeader: { marginTop: Spacing.three, marginBottom: Spacing.one },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowName: { flexShrink: 1 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
});
