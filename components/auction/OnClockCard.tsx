import type { AuctionStatePlayer } from "@/lib/services/auctionState.service";
import { card } from "@/lib/ui";

export function OnClockCard({
  player,
  photoWidth = 128,
  photoHeight = 128,
}: {
  player?: AuctionStatePlayer;
  photoWidth?: number;
  photoHeight?: number;
}) {
  if (!player) {
    return (
      <div className={`${card} px-4 py-6 text-center`}>
        <p className="text-black/60 dark:text-white/60">No player is currently on the clock.</p>
      </div>
    );
  }
  return (
    <div className={`${card} flex flex-col items-center text-center gap-3 p-4`}>
      {player.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={player.photoUrl}
          alt={player.name}
          className="rounded-lg object-cover bg-black/5 dark:bg-white/5"
          style={{ width: photoWidth, height: photoHeight }}
        />
      ) : (
        <div
          className="rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center text-xs text-black/40 dark:text-white/40"
          style={{ width: photoWidth, height: photoHeight }}
        >
          No photo
        </div>
      )}
      <p className="text-xl font-semibold">{player.name}</p>
      <p className="text-sm text-black/60 dark:text-white/60">
        {player.categoryName} &middot; base price {player.basePrice}
      </p>
      {player.previousTeam && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Previous team: {player.previousTeam}
        </p>
      )}
    </div>
  );
}
