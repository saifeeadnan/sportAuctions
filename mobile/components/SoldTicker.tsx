import { View } from "react-native";
import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/auctionState/reduceAuctionEvent";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/Card";
import { Spacing } from "@/constants/theme";

function byMostRecentFirst(a: AuctionStatePlayer, b: AuctionStatePlayer): number {
  const aTime = a.soldAt ? new Date(a.soldAt).getTime() : 0;
  const bTime = b.soldAt ? new Date(b.soldAt).getTime() : 0;
  return bTime - aTime;
}

/** Mobile adaptation of components/auction/SoldTicker.tsx — same underlying
 * information (each team's sold players + the unsold list), restructured
 * as stacked per-team sections instead of a wide side-by-side table, which
 * has no room to work on a phone-width screen. Shown only to a viewer with
 * no team of their own in this auction. */
export function SoldTicker({ players, teams }: { players: AuctionStatePlayer[]; teams: AuctionStateTeam[] }) {
  const soldByTeam = new Map<string, AuctionStatePlayer[]>();
  for (const team of teams) soldByTeam.set(team.teamName, []);
  for (const p of players) {
    if (p.status === "SOLD" && p.soldToTeamName) soldByTeam.get(p.soldToTeamName)?.push(p);
  }
  for (const list of soldByTeam.values()) list.sort(byMostRecentFirst);

  const unsold = [...players].filter((p) => p.status === "UNSOLD").sort((a, b) => a.name.localeCompare(b.name));

  const hasAny = [...soldByTeam.values()].some((list) => list.length > 0) || unsold.length > 0;
  if (!hasAny) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No players resolved yet.
      </ThemedText>
    );
  }

  return (
    <View style={{ gap: Spacing.three }}>
      {teams.map((t) => {
        const sold = soldByTeam.get(t.teamName) ?? [];
        if (sold.length === 0) return null;
        return (
          <Card key={t.id} style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold">{t.teamName}</ThemedText>
            {sold.map((p) => (
              <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <ThemedText type="small">{p.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {p.soldPrice}
                </ThemedText>
              </View>
            ))}
          </Card>
        );
      })}
      {unsold.length > 0 && (
        <Card style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Unsold
          </ThemedText>
          {unsold.map((p) => (
            <ThemedText key={p.id} type="small" themeColor="textSecondary">
              {p.name}
            </ThemedText>
          ))}
        </Card>
      )}
    </View>
  );
}
