import { ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { resolveMediaUrl } from "@/services/apiClient";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type RosterRibbonPlayer = {
  id: string;
  playerName: string;
  photoUrl: string | null;
  position: string | null;
  soldPrice: string | null;
  isCaptain?: boolean;
};

/** Mirrors components/roster/RosterRibbon.tsx — a horizontally-scrolling
 * strip by default, or a wrapping 2-column grid (`grid`) like the fantasy
 * builder's "Current team" section uses. `highlightId` calls out one player
 * (e.g. "You") with an accent ring + badge, same as the web version. */
export function RosterRibbon({
  players,
  grid = false,
  highlightId,
}: {
  players: RosterRibbonPlayer[];
  grid?: boolean;
  highlightId?: string;
}) {
  const theme = useTheme();

  if (players.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No players confirmed yet.
      </ThemedText>
    );
  }

  const cards = players.map((p) => {
    const uri = resolveMediaUrl(p.photoUrl);
    const isHighlighted = p.id === highlightId;
    return (
      <Card
        key={p.id}
        style={[
          grid ? styles.gridCard : styles.rowCard,
          isHighlighted && { borderColor: theme.accent, borderWidth: 2 },
        ]}
      >
        <View style={[styles.photoWrap, { backgroundColor: theme.neutralBg }]}>
          {uri ? (
            <Image source={{ uri }} style={styles.photo} contentFit="cover" />
          ) : (
            <Ionicons name="person" size={28} color={theme.textSecondary} />
          )}
        </View>
        <ThemedText type="small" numberOfLines={1}>
          {p.playerName}
        </ThemedText>
        <View style={styles.badgeRow}>
          {p.position && <Badge tone="neutral">{p.position}</Badge>}
          {isHighlighted && <Badge tone="accent">You</Badge>}
          {p.isCaptain && <Badge tone="success">Captain</Badge>}
        </View>
        <ThemedText type="smallBold">{p.soldPrice ?? "—"}</ThemedText>
      </Card>
    );
  });

  if (grid) {
    return <View style={styles.grid}>{cards}</View>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {cards}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two, paddingRight: Spacing.three },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  rowCard: { width: 120, gap: Spacing.one },
  gridCard: { width: "47%", gap: Spacing.one },
  badgeRow: { flexDirection: "row", gap: Spacing.one, flexWrap: "wrap" },
  photoWrap: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: Radius.small,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%" },
});
