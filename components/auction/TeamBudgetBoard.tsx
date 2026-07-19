import type { AuctionStateTeam } from "@/lib/services/auctionState.service";
import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

const STATUS_VARIANT: Record<string, "neutral" | "info" | "success"> = {
  AUCTION_LIVE: "info",
  FINAL: "success",
};

export function TeamBudgetBoard({
  teams,
  maxBids,
  showStatus = true,
}: {
  teams: AuctionStateTeam[];
  maxBids?: Record<string, string>;
  showStatus?: boolean;
}) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pl-4 pr-4">Team</th>
            <th className="py-2 pr-4">Budget remaining</th>
            <th className="py-2 pr-4">Slots</th>
            {showStatus && <th className="py-2 pr-4">Status</th>}
            {maxBids && <th className="py-2 pr-4">Max bid</th>}
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
              <td className="py-2 pl-4 pr-4">{t.teamName}</td>
              <td className="py-2 pr-4">{t.budgetRemaining}</td>
              <td className="py-2 pr-4">
                {t.slotsFilled}/{t.slotsTotal}
              </td>
              {showStatus && (
                <td className="py-2 pr-4">
                  <Badge variant={STATUS_VARIANT[t.status] ?? "neutral"}>{t.status}</Badge>
                </td>
              )}
              {maxBids && <td className="py-2 pr-4">{maxBids[t.id] ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
