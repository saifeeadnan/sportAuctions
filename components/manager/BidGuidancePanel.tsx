import { Badge } from "@/components/ui/Badge";
import type { GuidanceSignal } from "@/lib/auction/guidance";

const SIGNAL_VARIANT: Record<GuidanceSignal, "success" | "info" | "warning"> = {
  BID: "success",
  CONSIDER: "info",
  PASS: "warning",
};

const SIGNAL_LABEL: Record<GuidanceSignal, string> = {
  BID: "Bid",
  CONSIDER: "Consider",
  PASS: "Pass",
};

export function BidGuidancePanel({
  signal,
  suggestedMaxBid,
  reason,
}: {
  signal: GuidanceSignal;
  suggestedMaxBid: number | null;
  reason: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-black/10 dark:border-white/10 px-3 py-2">
      <div className="flex items-center gap-2">
        <Badge variant={SIGNAL_VARIANT[signal]}>{SIGNAL_LABEL[signal]}</Badge>
        {suggestedMaxBid != null && (
          <span className="text-sm font-medium">Suggested max: {suggestedMaxBid}</span>
        )}
      </div>
      <p className="text-xs text-black/60 dark:text-white/60">{reason}</p>
    </div>
  );
}
