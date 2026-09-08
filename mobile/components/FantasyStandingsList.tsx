import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/services/apiClient";
import { formatDateTime } from "@/lib/dates";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { SponsorRibbon } from "@/components/SponsorRibbon";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type Pick = { auctionPlayerId: string; playerName: string; price: string; points: string | null };
type Standing = {
  teamId: string;
  teamName: string | null;
  ownerName: string;
  isMine: boolean;
  rank: number;
  previousRank: number | null;
  rankDelta: number | null;
  pointsDelta: number | null;
  totalPoints: number;
  totalSpend: number;
  picks: Pick[];
};
type UploadInfo = { uploadedAt: string; label: string | null };
type StandingsResponse =
  | { locked: false }
  | {
      locked: true;
      hasPoints: boolean;
      latestUpload: UploadInfo | null;
      previousUpload: UploadInfo | null;
      standings: Standing[];
    };

/**
 * The locked-state fantasy screen: every team ranked (tied teams share a
 * rank), with ▲/▼ movement since the previous points upload — the mobile
 * twin of the web's FantasyStandingsList. Owns the ScrollView so pull-to-
 * refresh can re-run its own query.
 */
export function FantasyStandingsView({ auctionId, breadcrumb }: { auctionId: string; breadcrumb: string }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["fantasy-standings", auctionId],
    queryFn: () => apiFetch<StandingsResponse>(`/api/mobile/auctions/${auctionId}/fantasy-standings`),
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
        <ThemedText themeColor="danger">Couldn't load the fantasy standings.</ThemedText>
      </ThemedView>
    );
  }

  function toggle(teamId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  const locked = data.locked ? data : null;
  const showMovement = locked != null && locked.hasPoints && locked.previousUpload != null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.accent} />}
    >
      <ThemedText type="small" themeColor="textSecondary">
        {breadcrumb}
      </ThemedText>

      {!locked ? (
        <ThemedText themeColor="textSecondary">Fantasy standings appear once picks have locked.</ThemedText>
      ) : locked.standings.length === 0 ? (
        <ThemedText themeColor="textSecondary">No fantasy teams were submitted.</ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {locked.hasPoints
              ? `Ranked by total points${
                  locked.latestUpload
                    ? ` · updated ${formatDateTime(locked.latestUpload.uploadedAt)}${
                        locked.latestUpload.label ? ` — ${locked.latestUpload.label}` : ""
                      }`
                    : ""
                }${showMovement ? ` · arrows vs. ${formatDateTime(locked.previousUpload!.uploadedAt)}` : ""}.`
              : "Points haven't been uploaded yet — ranked by team strength in the meantime."}
          </ThemedText>

          <View style={styles.list}>
            {locked.standings.map((s) => {
              const open = expanded.has(s.teamId);
              return (
                <Pressable key={s.teamId} onPress={() => toggle(s.teamId)}>
                  <Card style={s.isMine ? { ...styles.row, borderColor: theme.accent, borderWidth: 1.5 } : styles.row}>
                    <View style={styles.rowHeader}>
                      <View style={styles.rankCell}>
                        <ThemedText type="smallBold">#{s.rank}</ThemedText>
                        {showMovement && <Movement delta={s.rankDelta} isNew={s.previousRank == null} />}
                      </View>
                      <View style={styles.rowText}>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {s.teamName || s.ownerName}
                        </ThemedText>
                        {s.teamName ? (
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                            {s.ownerName}
                          </ThemedText>
                        ) : null}
                      </View>
                      {s.isMine && <Badge tone="accent">You</Badge>}
                      <ThemedText type="smallBold" themeColor="accent">
                        {locked.hasPoints ? `${s.totalPoints} pts` : `spent ${s.totalSpend}`}
                      </ThemedText>
                      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={theme.textSecondary} />
                    </View>

                    {open && (
                      <View style={[styles.picks, { borderTopColor: theme.border }]}>
                        {[...s.picks]
                          .sort((a, b) => Number(b.points ?? -Infinity) - Number(a.points ?? -Infinity))
                          .map((p) => (
                            <View key={p.auctionPlayerId} style={styles.pickRow}>
                              <ThemedText type="small" style={styles.pickName} numberOfLines={1}>
                                {p.playerName}
                              </ThemedText>
                              <ThemedText type="small" themeColor="textSecondary">
                                {p.price}
                              </ThemedText>
                              {locked.hasPoints && (
                                <ThemedText type="smallBold" style={styles.pickPoints}>
                                  {p.points ?? "—"}
                                </ThemedText>
                              )}
                            </View>
                          ))}
                      </View>
                    )}
                  </Card>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <SponsorRibbon auctionId={auctionId} />
    </ScrollView>
  );
}

/** ▲ N / ▼ N in the status colors, "–" for no change, "new" for a team that
 * has no previous rank to compare against. */
function Movement({ delta, isNew }: { delta: number | null; isNew: boolean }) {
  const theme = useTheme();
  if (isNew) {
    return (
      <ThemedText type="label" themeColor="textSecondary">
        new
      </ThemedText>
    );
  }
  if (delta == null) return null;
  if (delta === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        –
      </ThemedText>
    );
  }
  const up = delta > 0;
  const color = up ? theme.success : theme.danger;
  return (
    <View style={styles.movement}>
      <Ionicons name={up ? "caret-up" : "caret-down"} size={14} color={color} />
      <ThemedText type="smallBold" style={{ color }}>
        {Math.abs(delta)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.four },
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  list: { gap: Spacing.two },
  row: { gap: Spacing.two, borderRadius: Radius.medium },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  rankCell: { flexDirection: "row", alignItems: "center", gap: Spacing.one, minWidth: 52 },
  rowText: { flex: 1, gap: 2 },
  movement: { flexDirection: "row", alignItems: "center" },
  picks: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.one },
  pickRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  pickName: { flex: 1 },
  pickPoints: { minWidth: 40, textAlign: "right" },
});
