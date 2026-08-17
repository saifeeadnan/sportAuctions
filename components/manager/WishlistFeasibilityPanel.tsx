import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export type WishlistItemDisplay = {
  playerId: string;
  playerName: string;
  status: "AVAILABLE" | "WON" | "LOST";
  estimatedPrice: number | null;
  valueScore: number | null;
};

/**
 * Live status of this manager's own must-have players — who's already
 * resolved (won/lost) and, for what's still available, an estimated price
 * and value score. The Comfortable/Tight/Short summary this data feeds
 * lives separately on Live Analytics (WishlistStatusBadge) — this is just
 * the player-by-player detail, kept next to where the wishlist gets set.
 */
export function WishlistFeasibilityPanel({ items }: { items: WishlistItemDisplay[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        No must-have players set — mark some above to track their live status here.
      </p>
    );
  }

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pl-4 pr-4">Player</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4 text-right">Estimated price</th>
            <th className="py-2 pr-4 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.playerId} className="border-b border-black/5 dark:border-white/5 last:border-0">
              <td className="py-2 pl-4 pr-4">{item.playerName}</td>
              <td className="py-2 pr-4">
                {item.status === "AVAILABLE" && <Badge variant="info">Available</Badge>}
                {item.status === "WON" && <Badge variant="success">Won</Badge>}
                {item.status === "LOST" && <Badge variant="neutral">Lost</Badge>}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {item.estimatedPrice != null ? Math.round(item.estimatedPrice).toLocaleString() : "—"}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {item.valueScore != null ? item.valueScore.toFixed(1) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
