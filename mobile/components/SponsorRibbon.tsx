import { ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, resolveMediaUrl } from "@/services/apiClient";
import { useAuth } from "@/context/AuthContext";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { Spacing } from "@/constants/theme";

type Sponsor = { id: string; name: string; tier: string; websiteUrl: string | null; logoUrl: string | null };

const TIER_SIZE: Record<string, number> = { TITLE: 72, MARQUEE: 64, COMMUNITY: 56 };

/** A simple horizontal strip of sponsor logos — the mobile equivalent of the
 * web's SponsorRibbon (components/tournament/SponsorRibbon.tsx). Skips that
 * component's rotating-spotlight/shuffle animation (a lot of complexity for
 * a screen this size) but keeps the core idea: sponsor logos, tier-scaled,
 * always visible near the content they're sponsoring. A logo with no
 * externally-hosted logoUrl falls back to this app's own image-serving
 * route, which needs the same bearer token as every other request. */
export function SponsorRibbon({ auctionId }: { auctionId: string }) {
  const { token } = useAuth();
  const theme = useTheme();
  const { data } = useQuery({
    queryKey: ["sponsors", auctionId],
    queryFn: () => apiFetch<Sponsor[]>(`/api/mobile/auctions/${auctionId}/sponsors`),
  });

  if (!data || data.length === 0) return null;

  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      <ThemedText type="label" themeColor="textSecondary">
        Sponsors
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {data.map((sponsor) => {
          const size = TIER_SIZE[sponsor.tier] ?? TIER_SIZE.COMMUNITY;
          const uri =
            resolveMediaUrl(sponsor.logoUrl) ?? `${process.env.EXPO_PUBLIC_API_URL}/api/tournament-sponsors/${sponsor.id}`;
          return (
            <View key={sponsor.id} style={styles.item}>
              <Image
                source={{ uri, headers: sponsor.logoUrl ? undefined : { Authorization: `Bearer ${token}` } }}
                style={[
                  styles.logo,
                  { width: size, height: size, backgroundColor: "#fff", borderColor: theme.border },
                ]}
                contentFit="contain"
              />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ maxWidth: size }}>
                {sponsor.name}
              </ThemedText>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, gap: Spacing.two },
  row: { gap: Spacing.three, paddingRight: Spacing.three },
  item: { alignItems: "center", gap: Spacing.one },
  logo: { borderRadius: 10, borderWidth: 1, padding: Spacing.one },
});
