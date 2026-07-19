import { formatSoldVia } from "@/lib/format";
import { card } from "@/lib/ui";

export type ConfirmedRosterPlayer = {
  id: string;
  playerName: string;
  categoryName: string;
  soldPrice: string | null;
  soldVia: string | null;
};

export function ConfirmedRosterTable({ players }: { players: ConfirmedRosterPlayer[] }) {
  if (players.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No players confirmed yet.</p>;
  }

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pl-4 pr-4">Player</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Price</th>
            <th className="py-2 pr-4">Via</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
              <td className="py-2 pl-4 pr-4">{p.playerName}</td>
              <td className="py-2 pr-4">{p.categoryName}</td>
              <td className="py-2 pr-4">{p.soldPrice ?? "—"}</td>
              <td className="py-2 pr-4">{formatSoldVia(p.soldVia)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
