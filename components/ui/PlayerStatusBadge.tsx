import { Badge } from "@/components/ui/Badge";

type Entry = { variant: "neutral" | "info" | "warning" | "success" | "danger"; label: string };

/**
 * AuctionPlayerStatus -> badge, one shared mapping instead of each list
 * re-deriving its own ad hoc subset. AVAILABLE has no entry on purpose —
 * it's the default, nothing-special state, so it renders no badge at all,
 * same as before this file existed.
 */
const PLAYER_STATUS_BADGE: Record<string, Entry | undefined> = {
  IN_PRE_AUCTION_POOL: { variant: "warning", label: "Contested" },
  IN_BIDDING: { variant: "info", label: "On the clock" },
  SOLD: { variant: "success", label: "Sold" },
  UNSOLD: { variant: "neutral", label: "Re-offer" },
};

export function PlayerStatusBadge({ status }: { status: string }) {
  const entry = PLAYER_STATUS_BADGE[status];
  if (!entry) return null;
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
