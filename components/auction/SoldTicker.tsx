import type { AuctionStatePlayer } from "@/lib/services/auctionState.service";

export function SoldTicker({ players }: { players: AuctionStatePlayer[] }) {
  const resolved = players.filter((p) => p.status === "SOLD" || p.status === "UNSOLD");
  if (resolved.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No players resolved yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {resolved.map((p) => (
        <li key={p.id}>
          {p.status === "SOLD" ? (
            <span>
              <strong>{p.name}</strong> sold to {p.soldToTeamName} for {p.soldPrice}
            </span>
          ) : (
            <span className="text-black/60 dark:text-white/60">{p.name} — unsold</span>
          )}
        </li>
      ))}
    </ul>
  );
}
