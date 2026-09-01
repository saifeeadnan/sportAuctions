import { View } from "react-native";
import type { AuctionStateTeam } from "@/lib/auctionState/reduceAuctionEvent";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/Card";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Spacing } from "@/constants/theme";

const STATUS_TONE: Record<string, BadgeTone> = { AUCTION_LIVE: "live", FINAL: "success" };

/** Mirrors components/auction/TeamBudgetBoard.tsx — shown only to a viewer
 * with no team of their own in this auction (a manager sees their own team
 * card + remaining pool instead, see LiveAuctionView.tsx). */
export function TeamBudgetBoard({ teams }: { teams: AuctionStateTeam[] }) {
  return (
    <View style={{ gap: Spacing.two }}>
      {teams.map((t) => (
        <Card key={t.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <ThemedText type="small">{t.teamName}</ThemedText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.two }}>
            <ThemedText type="small" themeColor="textSecondary">
              {t.budgetRemaining} · {t.slotsFilled}/{t.slotsTotal}
            </ThemedText>
            <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
          </View>
        </Card>
      ))}
    </View>
  );
}
