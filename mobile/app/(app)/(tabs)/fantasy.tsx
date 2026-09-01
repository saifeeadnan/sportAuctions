import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/services/apiClient";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type FantasyOverviewItem = { auctionId: string; auctionName: string; tournamentName: string; submitted: boolean };

export default function FantasyScreen() {
  const theme = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["fantasy-teams"],
    queryFn: () => apiFetch<FantasyOverviewItem[]>("/api/mobile/fantasy-teams"),
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ThemedText type="title" style={styles.heading}>
        Fantasy teams
      </ThemedText>

      {isLoading && <ActivityIndicator style={styles.spinner} color={theme.accent} />}
      {error && (
        <ThemedText type="small" themeColor="danger">
          Couldn't load fantasy auctions.
        </ThemedText>
      )}

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.auctionId}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !isLoading ? (
            <ThemedText themeColor="textSecondary">
              No completed auctions you're eligible for yet.
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/fantasy/${item.auctionId}`)}>
            <Card style={styles.row}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">{item.auctionName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.tournamentName}
                </ThemedText>
                <Badge tone={item.submitted ? "success" : "accent"}>
                  {item.submitted ? "Submitted" : "Build your team"}
                </Badge>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
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
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowText: { gap: Spacing.one, flex: 1 },
});
