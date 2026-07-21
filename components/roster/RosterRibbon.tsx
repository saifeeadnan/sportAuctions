import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export type RosterRibbonPlayer = {
  id: string;
  playerName: string;
  photoUrl: string | null;
  position: string | null;
  soldPrice: string | null;
};

export function RosterRibbon({
  players,
  grid = false,
}: {
  players: RosterRibbonPlayer[];
  /** Wrap into a 4-per-row grid instead of a single horizontally-scrolling strip. */
  grid?: boolean;
}) {
  if (players.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No players confirmed yet.</p>;
  }

  return (
    <div className={grid ? "grid grid-cols-2 sm:grid-cols-4 gap-3" : "flex gap-3 overflow-x-auto pb-1"}>
      {players.map((p) => (
        <div
          key={p.id}
          className={`${card} overflow-hidden ${grid ? "w-full" : "w-[132px] shrink-0"}`}
        >
          <div className="w-full aspect-[3/4] bg-black/5 dark:bg-white/5 flex items-center justify-center overflow-hidden">
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.photoUrl}
                alt={p.playerName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-black/40 dark:text-white/40">No photo</span>
            )}
          </div>
          <div className="p-2 flex flex-col gap-1">
            <p className="text-sm font-medium truncate" title={p.playerName}>
              {p.playerName}
            </p>
            {p.position && <Badge variant="neutral">{p.position}</Badge>}
            <p className="text-sm text-black/70 dark:text-white/70">{p.soldPrice ?? "—"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
