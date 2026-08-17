import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export type RivalRosterPlayerDisplay = {
  playerId: string;
  playerName: string;
  categoryName: string;
  price: number;
  valueScore: number | null;
};

export type RivalRosterDisplay = {
  teamId: string;
  teamName: string;
  isSelf: boolean;
  budgetRemaining: number;
  teamStrength: number;
  players: RivalRosterPlayerDisplay[];
};

/** Every team's currently-confirmed roster — who they've actually won so
 * far, at what price, ranked by this player's value score within the team.
 * The manager's own team is always first. Read-only, no photos (matches
 * the compact roster convention used elsewhere once picks are final). */
export function RivalRostersPanel({ rosters }: { rosters: RivalRosterDisplay[] }) {
  if (rosters.every((r) => r.players.length === 0)) {
    return <p className="text-sm text-black/50 dark:text-white/50">No players sold yet.</p>;
  }

  return (
    <div className={card}>
      {rosters.map((r, i) => (
        <details
          key={r.teamId}
          className={i < rosters.length - 1 ? "border-b border-black/[0.08] dark:border-white/10" : ""}
        >
          <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-center gap-2">
              {r.teamName}
              {r.isSelf && <Badge variant="info">You</Badge>}
            </span>
            <span className="text-black/60 dark:text-white/60 font-normal">
              {r.players.length} player{r.players.length === 1 ? "" : "s"} &middot; budget left{" "}
              {r.budgetRemaining.toLocaleString()} &middot; strength {r.teamStrength.toFixed(1)}
            </span>
          </summary>
          <div className="px-4 pb-4">
            {r.players.length === 0 ? (
              <p className="text-sm text-black/50 dark:text-white/50">No players sold yet.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-black/10 dark:border-white/10">
                    <th className="py-2 pr-4">Player</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4 text-right">Price</th>
                    <th className="py-2 pr-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {r.players.map((p) => (
                    <tr key={p.playerId} className="border-b border-black/5 dark:border-white/5 last:border-0">
                      <td className="py-2 pr-4">{p.playerName}</td>
                      <td className="py-2 pr-4">{p.categoryName}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{p.price.toLocaleString()}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {p.valueScore != null ? p.valueScore.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
