import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { ON_CLOCK_FIELD_LABELS, type OnClockFieldKey, type OnClockTemplate } from "@/lib/onClockDisplay";
import type { AuctionStatePlayer } from "@/lib/auctionState/reduceAuctionEvent";
import { resolveMediaUrl } from "@/services/apiClient";
import { ThemedText } from "@/components/themed-text";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/use-theme";
import { Radius, Spacing } from "@/constants/theme";

const EXTRA_FIELD_ORDER: OnClockFieldKey[] = [
  "position",
  "age",
  "previousTeam",
  "rating",
  "battingRating",
  "bowlingRating",
  "fieldingRating",
];

function extraFieldValues(player: AuctionStatePlayer, visibleFields: OnClockFieldKey[]) {
  const raw: Record<OnClockFieldKey, string | number | null> = {
    photoUrl: null,
    position: player.position,
    age: player.age,
    previousTeam: player.previousTeam,
    rating: player.rating,
    battingRating: player.battingRating,
    bowlingRating: player.bowlingRating,
    fieldingRating: player.fieldingRating,
  };
  return EXTRA_FIELD_ORDER.filter((key) => visibleFields.includes(key))
    .map((key) => ({ label: ON_CLOCK_FIELD_LABELS[key], value: raw[key] }))
    .filter((row): row is { label: string; value: string | number } => row.value != null);
}

/** Renders the on-clock player using whichever template + field set the
 * admin configured for this auction (Auction.onClockTemplate/
 * onClockVisibleFields) — mirrors components/auction/OnClockCard.tsx's
 * three templates so the mobile app shows the same layout the admin chose
 * on the web, not a fixed design of our own. Skips that version's
 * per-category accent coloring (Tailwind-class-based, not portable) in
 * favor of this app's own single accent color. */
export function OnClockCard({
  player,
  template,
  visibleFields,
}: {
  player: AuctionStatePlayer;
  template: OnClockTemplate;
  visibleFields: OnClockFieldKey[];
}) {
  if (template === "PHOTO_FOCUS") return <PhotoFocusOnClock player={player} visibleFields={visibleFields} />;
  if (template === "STATS_TABLE") return <StatsTableOnClock player={player} visibleFields={visibleFields} />;
  return <ClassicOnClock player={player} visibleFields={visibleFields} />;
}

function PhotoFallback({ size, radius }: { size: number; radius: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.photoFallback,
        { width: size, height: size, borderRadius: radius, backgroundColor: theme.backgroundSelected },
      ]}
    >
      <Ionicons name="person" size={Math.round(size * 0.4)} color={theme.accent} />
    </View>
  );
}

function ExtraFieldChips({ fields }: { fields: { label: string; value: string | number }[] }) {
  const theme = useTheme();
  if (fields.length === 0) return null;
  return (
    <View style={styles.chipRow}>
      {fields.map((f) => (
        <View key={f.label} style={[styles.chip, { backgroundColor: theme.neutralBg }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {f.label}: {f.value}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

function ClassicOnClock({ player, visibleFields }: { player: AuctionStatePlayer; visibleFields: OnClockFieldKey[] }) {
  const uri = visibleFields.includes("photoUrl") ? resolveMediaUrl(player.photoUrl) : null;
  const extras = extraFieldValues(player, visibleFields);

  return (
    <View style={styles.classicContainer}>
      {visibleFields.includes("photoUrl") &&
        (uri ? (
          <Image source={{ uri }} style={styles.classicPhoto} contentFit="cover" transition={150} />
        ) : (
          <PhotoFallback size={90} radius={Radius.large} />
        ))}
      <ThemedText type="subtitle" style={styles.centerText}>
        {player.name}
      </ThemedText>
      <Badge tone="accent">{player.categoryName}</Badge>
      <ThemedText type="small" themeColor="textSecondary">
        Base price {player.basePrice} · {player.bidCount === 0 ? "No bids yet" : `${player.bidCount} bids`}
      </ThemedText>
      <ExtraFieldChips fields={extras} />
    </View>
  );
}

function PhotoFocusOnClock({
  player,
  visibleFields,
}: {
  player: AuctionStatePlayer;
  visibleFields: OnClockFieldKey[];
}) {
  const theme = useTheme();
  const uri = visibleFields.includes("photoUrl") ? resolveMediaUrl(player.photoUrl) : null;
  const extras = extraFieldValues(player, visibleFields);

  return (
    <View style={styles.photoFocusContainer}>
      <View style={styles.heroWrap}>
        {uri ? (
          <Image source={{ uri }} style={styles.hero} contentFit="cover" />
        ) : (
          <View style={[styles.hero, { backgroundColor: theme.backgroundSelected, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="person" size={54} color={theme.accent} />
          </View>
        )}
        <View style={styles.heroBadge}>
          <Badge tone="accent">{player.categoryName}</Badge>
        </View>
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.heroScrim}>
          <ThemedText style={styles.heroName}>{player.name.toUpperCase()}</ThemedText>
          <ThemedText style={styles.heroPrice}>Base price {player.basePrice}</ThemedText>
        </LinearGradient>
      </View>
      <ExtraFieldChips fields={extras} />
    </View>
  );
}

function StatsTableOnClock({
  player,
  visibleFields,
}: {
  player: AuctionStatePlayer;
  visibleFields: OnClockFieldKey[];
}) {
  const theme = useTheme();
  const uri = visibleFields.includes("photoUrl") ? resolveMediaUrl(player.photoUrl) : null;
  const tiles = [
    { label: "Base price", value: player.basePrice },
    { label: "Bids", value: player.bidCount },
    ...extraFieldValues(player, visibleFields),
  ];

  return (
    <View style={styles.statsContainer}>
      {visibleFields.includes("photoUrl") &&
        (uri ? (
          <Image source={{ uri }} style={styles.statsAvatar} contentFit="cover" transition={150} />
        ) : (
          <PhotoFallback size={66} radius={33} />
        ))}
      <ThemedText type="smallBold" style={styles.centerText}>
        {player.name}
      </ThemedText>
      <Badge tone="accent">{player.categoryName}</Badge>

      <View style={styles.statsGrid}>
        {tiles.map((tile) => (
          <Card key={tile.label} style={[styles.statsTile, { backgroundColor: theme.neutralBg, borderColor: theme.border }]}>
            <ThemedText type="smallBold">{tile.value}</ThemedText>
            <ThemedText type="label" themeColor="textSecondary">
              {tile.label}
            </ThemedText>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerText: { textAlign: "center" },
  photoFallback: { alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: Spacing.one },
  chip: { paddingHorizontal: Spacing.two, paddingVertical: 5, borderRadius: Radius.small },

  classicContainer: { alignItems: "center", gap: Spacing.two },
  classicPhoto: { width: 90, height: 90, borderRadius: Radius.large },

  photoFocusContainer: { gap: Spacing.two, alignSelf: "stretch", alignItems: "center" },
  // 75% width instead of the container's full width — a 1:1 aspect ratio
  // keeps it square either way, so shrinking the width shrinks the whole
  // hero photo proportionally (a 25% reduction in linear size).
  heroWrap: { width: "75%", aspectRatio: 1, borderRadius: Radius.large, overflow: "hidden" },
  hero: { width: "100%", height: "100%" },
  heroBadge: { position: "absolute", top: Spacing.two, right: Spacing.two },
  heroScrim: { position: "absolute", left: 0, right: 0, bottom: 0, padding: Spacing.three, paddingTop: Spacing.six },
  heroName: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: 0.3 },
  heroPrice: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 },

  statsContainer: { alignItems: "center", gap: Spacing.two, alignSelf: "stretch" },
  statsAvatar: { width: 66, height: 66, borderRadius: 33 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two, alignSelf: "stretch", justifyContent: "center" },
  statsTile: { width: "31%", alignItems: "center", gap: 2, paddingVertical: Spacing.two },
});
