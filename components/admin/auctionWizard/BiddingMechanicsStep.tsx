import { card, inputClass } from "@/lib/ui";

export function BiddingMechanicsStep({
  lotTimerEnabled,
  onLotTimerEnabledChange,
  lotTimerSeconds,
  onLotTimerSecondsChange,
  reAuctionEnabled,
  onReAuctionEnabledChange,
  reAuctionDiscountPercent,
  onReAuctionDiscountPercentChange,
}: {
  lotTimerEnabled: boolean;
  onLotTimerEnabledChange: (v: boolean) => void;
  lotTimerSeconds: string;
  onLotTimerSecondsChange: (v: string) => void;
  reAuctionEnabled: boolean;
  onReAuctionEnabledChange: (v: boolean) => void;
  reAuctionDiscountPercent: string;
  onReAuctionDiscountPercentChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className={`${card} p-4 max-w-lg`}>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={lotTimerEnabled}
            onChange={(e) => onLotTimerEnabledChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Enable a countdown timer</span>
            <br />
            <span className="text-black/60 dark:text-white/60">
              A visible countdown shown while a player is on the clock, resetting on every new
              bid. Purely visual — it never records a sale or marks a player unsold on its own,
              you still do that yourself. You can&apos;t change this after the auction is
              created.
            </span>
          </span>
        </label>
        {lotTimerEnabled && (
          <label className="flex items-center gap-2 text-sm mt-3 ml-6">
            <span>Seconds per bid</span>
            <input
              type="number"
              min={3}
              max={600}
              value={lotTimerSeconds}
              onChange={(e) => onLotTimerSecondsChange(e.target.value)}
              className={`${inputClass} w-24`}
            />
          </label>
        )}
      </div>

      <div className={`${card} p-4 max-w-lg`}>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={reAuctionEnabled}
            onChange={(e) => onReAuctionEnabledChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Re-offer unsold players at a reduced price</span>
            <br />
            <span className="text-black/60 dark:text-white/60">
              The first time a player goes unsold, its base price drops by this percentage for
              every future re-offer — the discount only ever applies once per player, even if it
              goes unsold again later. You can&apos;t change this after the auction is created.
            </span>
          </span>
        </label>
        {reAuctionEnabled && (
          <label className="flex items-center gap-2 text-sm mt-3 ml-6">
            <span>Discount</span>
            <input
              type="number"
              min={1}
              max={99}
              value={reAuctionDiscountPercent}
              onChange={(e) => onReAuctionDiscountPercentChange(e.target.value)}
              className={`${inputClass} w-20`}
            />
            <span>%</span>
          </label>
        )}
      </div>
    </div>
  );
}
