import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/services/apiClient";
import type { AuctionState, AuctionStatePlayer } from "@/lib/auctionState/reduceAuctionEvent";
import { computeMaxBid } from "@/lib/auction/maxBid";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { BidControl } from "@/components/BidControl";
import { OnClockCard } from "@/components/OnClockCard";
import { OnClockTimer } from "@/components/OnClockTimer";
import { TeamStrengthSummary } from "@/components/TeamStrengthSummary";
import { RemainingPool } from "@/components/RemainingPool";
import { RosterRibbon } from "@/components/RosterRibbon";
import { TeamBudgetBoard } from "@/components/TeamBudgetBoard";
import { SoldTicker } from "@/components/SoldTicker";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { SponsorRibbon } from "@/components/SponsorRibbon";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type MyTeam = {
  teamAuctionEntryId: string;
  teamName: string;
  budgetRemaining: string;
  slotsFilled: number;
  slotsTotal: number;
};

const QUEUE_STATUSES = new Set(["AVAILABLE", "IN_PRE_AUCTION_POOL", "UNSOLD"]);

export default function LiveAuctionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const stateQuery = useQuery({
    queryKey: ["auction-state", id],
    queryFn: () => apiFetch<AuctionState>(`/api/auctions/${id}/state`),
  });
  const myTeamQuery = useQuery({
    queryKey: ["my-team", id],
    queryFn: () =>
      apiFetch<MyTeam>(`/api/mobile/auctions/${id}/my-team`).catch((e) => {
        // 404 means this session doesn't manage a team in THIS auction; 403
        // means the account has no TEAM_MANAGER role anywhere at all (that
        // guard isn't scoped to one auction). Both are the same normal,
        // expected read-only-viewer case for this screen, not an error.
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null;
        throw e;
      }),
  });

  if (stateQuery.isLoading || !stateQuery.data) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.accent} />
      </ThemedView>
    );
  }

  return (
    <LiveAuctionBody
      auctionId={id}
      initialState={stateQuery.data}
      myTeam={myTeamQuery.data ?? null}
      onRefresh={() => {
        stateQuery.refetch();
        myTeamQuery.refetch();
      }}
      refreshing={stateQuery.isRefetching || myTeamQuery.isRefetching}
    />
  );
}

function CurrentBidLine({ player }: { player: AuctionStatePlayer }) {
  return (
    <ThemedText type="small">
      {player.currentBid ? (
        <>
          Current bid: <ThemedText type="smallBold">{player.currentBid}</ThemedText> by{" "}
          {player.currentBidderTeamName}
        </>
      ) : (
        <>No bids yet — base price {player.basePrice}</>
      )}
    </ThemedText>
  );
}

function LiveAuctionBody({
  auctionId,
  initialState,
  myTeam,
  onRefresh,
  refreshing,
}: {
  auctionId: string;
  initialState: AuctionState;
  myTeam: MyTeam | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const theme = useTheme();
  const { state, connected } = useAuctionSocket(auctionId, initialState);

  const onClock = state.players.find((p) => p.status === "IN_BIDDING") ?? null;
  const myTeamEntry = myTeam ? state.teams.find((t) => t.id === myTeam.teamAuctionEntryId) : undefined;
  const myPlayers = myTeamEntry ? state.players.filter((p) => p.soldToEntryId === myTeamEntry.id) : [];
  const queue = state.players.filter((p) => QUEUE_STATUSES.has(p.status));

  const remainingPoolBasePrices = onClock ? queue.filter((p) => p.id !== onClock.id).map((p) => Number(p.basePrice)) : [];
  const myMaxBid =
    myTeamEntry && onClock
      ? computeMaxBid(remainingPoolBasePrices, Number(myTeamEntry.budgetRemaining), myTeamEntry.slotsTotal - myTeamEntry.slotsFilled)
      : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" style={styles.flexShrink}>
          {state.name}
        </ThemedText>
        <Badge tone={connected ? "live" : "neutral"}>{connected ? "Live" : "Connecting"}</Badge>
      </View>

      {myTeamEntry ? (
        <>
          <Card style={styles.statCard}>
            <View style={styles.teamHeaderRow}>
              <ThemedText type="smallBold">{myTeamEntry.teamName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Budget {myTeamEntry.budgetRemaining} · Slots {myTeamEntry.slotsFilled}/{myTeamEntry.slotsTotal}
              </ThemedText>
            </View>
            <TeamStrengthSummary players={myPlayers} squadSize={myTeamEntry.slotsTotal} />
          </Card>

          <Card style={styles.onClockCard}>
            <ThemedText type="label" themeColor="textSecondary">
              On the clock
            </ThemedText>
            {onClock ? (
              <>
                <OnClockCard player={onClock} template={state.onClockTemplate} visibleFields={state.onClockVisibleFields} />
                <OnClockTimer player={onClock} totalSeconds={state.lotTimerSeconds} />
                <CurrentBidLine player={onClock} />
                {myMaxBid != null && (
                  <View style={styles.maxBidWrap}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Max possible bid:{" "}
                      <ThemedText type="smallBold">
                        {myMaxBid < Number(onClock.basePrice) ? "Cannot bid" : myMaxBid}
                      </ThemedText>
                      *
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.maxBidNote}>
                      * An indicator only — can change as the auction progresses.
                    </ThemedText>
                  </View>
                )}
                <View style={styles.bidControlWrap}>
                  <BidControl
                    auctionId={auctionId}
                    player={onClock}
                    teamEntryId={myTeamEntry.id}
                    slotsFilled={myTeamEntry.slotsFilled}
                    slotsTotal={myTeamEntry.slotsTotal}
                    maxBid={myMaxBid}
                  />
                </View>
              </>
            ) : (
              <ThemedText themeColor="textSecondary">No player is currently on the clock.</ThemedText>
            )}
          </Card>

          <Card>
            <RemainingPool queue={queue} />
          </Card>

          <View style={styles.section}>
            <ThemedText type="label" themeColor="textSecondary">
              Your roster
            </ThemedText>
            <RosterRibbon
              players={myPlayers
                .filter((p) => p.status === "SOLD")
                .map((p) => ({
                  id: p.id,
                  playerName: p.name,
                  photoUrl: p.photoUrl,
                  position: p.position,
                  soldPrice: p.soldPrice,
                  isCaptain: p.isCaptain,
                }))}
            />
          </View>
        </>
      ) : (
        <>
          <Card style={styles.onClockCard}>
            <ThemedText type="label" themeColor="textSecondary">
              On the clock
            </ThemedText>
            {onClock ? (
              <>
                <OnClockCard player={onClock} template={state.onClockTemplate} visibleFields={state.onClockVisibleFields} />
                <OnClockTimer player={onClock} totalSeconds={state.lotTimerSeconds} />
                <CurrentBidLine player={onClock} />
              </>
            ) : (
              <ThemedText themeColor="textSecondary">No player is currently on the clock.</ThemedText>
            )}
          </Card>

          <View style={styles.section}>
            <ThemedText type="label" themeColor="textSecondary">
              Teams
            </ThemedText>
            <TeamBudgetBoard teams={state.teams} />
          </View>

          <View style={styles.section}>
            <ThemedText type="label" themeColor="textSecondary">
              Sold / unsold
            </ThemedText>
            <SoldTicker players={state.players} teams={state.teams} />
          </View>
        </>
      )}

      <SponsorRibbon auctionId={auctionId} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: Spacing.two },
  flexShrink: { flexShrink: 1 },
  statCard: { gap: Spacing.two },
  teamHeaderRow: { gap: Spacing.half },
  onClockCard: { alignItems: "center", gap: Spacing.two, paddingVertical: Spacing.four },
  maxBidWrap: { alignItems: "center", gap: 2 },
  maxBidNote: { fontSize: 11, textAlign: "center" },
  bidControlWrap: { alignItems: "center", gap: Spacing.one, alignSelf: "stretch" },
  section: { gap: Spacing.two },
});
