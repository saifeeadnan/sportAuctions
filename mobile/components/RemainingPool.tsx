import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { AuctionStatePlayer } from "@/lib/auctionState/reduceAuctionEvent";
import { ThemedText } from "@/components/themed-text";
import { Badge } from "@/components/Badge";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** Mirrors LiveAuctionView.tsx's "Remaining pool" section — same category
 * tabs (ordered by base price, highest first) and per-row status badges
 * (Contested for IN_PRE_AUCTION_POOL, Re-offer for UNSOLD). */
export function RemainingPool({ queue }: { queue: AuctionStatePlayer[] }) {
  const theme = useTheme();
  const categoryBasePrices = new Map<string, number>();
  for (const p of queue) {
    if (!categoryBasePrices.has(p.categoryName)) categoryBasePrices.set(p.categoryName, Number(p.basePrice));
  }
  const categories = Array.from(categoryBasePrices.keys()).sort(
    (a, b) => (categoryBasePrices.get(b) ?? 0) - (categoryBasePrices.get(a) ?? 0)
  );
  const [active, setActive] = useState("");
  const effective = active && categories.includes(active) ? active : (categories[0] ?? "");
  const visible = queue.filter((p) => p.categoryName === effective);

  return (
    <View style={styles.container}>
      <ThemedText type="label" themeColor="textSecondary">
        Remaining pool ({queue.length})
      </ThemedText>

      {categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {categories.map((cat) => {
            const count = queue.filter((p) => p.categoryName === cat).length;
            const isActive = effective === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setActive(cat)}
                style={[
                  styles.tab,
                  { borderColor: theme.border },
                  isActive && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
              >
                <ThemedText type="small" style={isActive ? { color: theme.accentText, fontWeight: "700" } : undefined}>
                  {cat} ({count})
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {visible.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No remaining players in this category.
        </ThemedText>
      ) : (
        <View>
          {visible.map((p) => (
            <View key={p.id} style={[styles.row, { borderBottomColor: theme.border }]}>
              <View style={styles.rowLeft}>
                <ThemedText type="small" numberOfLines={1} style={styles.rowName}>
                  {p.name}
                </ThemedText>
                {p.status === "IN_PRE_AUCTION_POOL" && <Badge tone="live">Contested</Badge>}
                {p.status === "UNSOLD" && <Badge tone="neutral">Re-offer</Badge>}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {p.basePrice}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  tabRow: { gap: Spacing.one },
  tab: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: Radius.pill, borderWidth: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.one, flexShrink: 1 },
  rowName: { flexShrink: 1 },
});
