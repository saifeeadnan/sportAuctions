import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuctionStatePlayer } from "@/lib/auctionState/reduceAuctionEvent";
import { apiFetch } from "@/services/apiClient";
import { useBidTiming } from "@/hooks/useBidTiming";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/Button";
import { Spacing } from "@/constants/theme";

function formatAmount(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Ported from the web app's components/auction/BidControl.tsx — same
 * disable predicate (leading bidder / squad full / no increment configured /
 * on cooldown / exceeds the reserve-aware max), calling the mobile bid route
 * instead of the web-only placeBidAction Server Action. */
export function BidControl({
  auctionId,
  player,
  teamEntryId,
  slotsFilled,
  slotsTotal,
  maxBid,
}: {
  auctionId: string;
  player: AuctionStatePlayer;
  teamEntryId: string;
  slotsFilled: number;
  slotsTotal: number;
  maxBid?: number | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { increment, cooldownMs, onCooldown, minNext } = useBidTiming(player);
  const isLeading = player.currentBidderEntryId === teamEntryId;
  const noRoom = slotsFilled >= slotsTotal;
  const quickBidExceedsMax = maxBid != null && minNext > maxBid;

  const mutation = useMutation({
    mutationFn: (amount: number) =>
      apiFetch(`/api/mobile/auctions/${auctionId}/bids`, {
        method: "POST",
        body: JSON.stringify({ auctionPlayerId: player.id, teamAuctionEntryId: teamEntryId, amount }),
      }),
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
    onSuccess: () => {
      setError(null);
      // The bid:placed socket event is what updates every client's state —
      // this is just to unstick React Query's own my-team budget cache.
      queryClient.invalidateQueries({ queryKey: ["my-team", auctionId] });
    },
  });

  if (isLeading) {
    return (
      <ThemedText type="smallBold" themeColor="success">
        You're the highest bidder
      </ThemedText>
    );
  }
  if (noRoom) {
    return <ThemedText themeColor="textSecondary">Your squad is full.</ThemedText>;
  }
  if (increment == null) {
    return (
      <ThemedText themeColor="textSecondary" style={styles.centerText}>
        Ask the auctioneer to set a bid increment for this category before bidding.
      </ThemedText>
    );
  }

  const disabled = onCooldown || quickBidExceedsMax;

  return (
    <View style={styles.container}>
      <Button onPress={() => mutation.mutate(minNext)} disabled={disabled} loading={mutation.isPending}>
        {onCooldown ? `Wait ${Math.ceil(cooldownMs / 1000)}s…` : `Bid ${formatAmount(minNext)}`}
      </Button>
      {quickBidExceedsMax && (
        <ThemedText type="small" themeColor="textSecondary">
          That would exceed your max possible bid.
        </ThemedText>
      )}
      {error && (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one, alignSelf: "stretch" },
  centerText: { textAlign: "center" },
});
