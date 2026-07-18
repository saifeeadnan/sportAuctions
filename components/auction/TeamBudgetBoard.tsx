import type { AuctionStateTeam } from "@/lib/services/auctionState.service";

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
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left border-b border-black/10 dark:border-white/10">
          <th className="py-2 pr-4">Team</th>
          <th className="py-2 pr-4">Budget remaining</th>
          <th className="py-2 pr-4">Slots</th>
          {showStatus && <th className="py-2 pr-4">Status</th>}
          {maxBids && <th className="py-2 pr-4">Max bid</th>}
        </tr>
      </thead>
      <tbody>
        {teams.map((t) => (
          <tr key={t.id} className="border-b border-black/5 dark:border-white/5">
            <td className="py-2 pr-4">{t.teamName}</td>
            <td className="py-2 pr-4">{t.budgetRemaining}</td>
            <td className="py-2 pr-4">
              {t.slotsFilled}/{t.slotsTotal}
            </td>
            {showStatus && <td className="py-2 pr-4">{t.status}</td>}
            {maxBids && <td className="py-2 pr-4">{maxBids[t.id] ?? "—"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
