import { card, inputClass, selectClass } from "@/lib/ui";
import {
  AUCTION_TYPES,
  AUCTION_TYPE_LABELS,
  IMPLEMENTED_AUCTION_TYPES,
  type AuctionType,
} from "@/lib/auctionTypes";

export function BasicsStep({
  name,
  onNameChange,
  teamBudget,
  onTeamBudgetChange,
  auctionType,
  onAuctionTypeChange,
}: {
  name: string;
  onNameChange: (v: string) => void;
  teamBudget: string;
  onTeamBudgetChange: (v: string) => void;
  auctionType: AuctionType;
  onAuctionTypeChange: (v: AuctionType) => void;
}) {
  const auctionTypeUnsupported = !IMPLEMENTED_AUCTION_TYPES.includes(auctionType);

  return (
    <div className={`${card} p-4 flex flex-col gap-3 max-w-md`}>
      <label className="flex flex-col gap-1 text-sm">
        Auction name
        <input
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Team budget
        <input
          required
          type="number"
          min={1}
          step="0.01"
          value={teamBudget}
          onChange={(e) => onTeamBudgetChange(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Auction type
        <select
          value={auctionType}
          onChange={(e) => onAuctionTypeChange(e.target.value as AuctionType)}
          className={selectClass}
        >
          {AUCTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {AUCTION_TYPE_LABELS[type]}
              {IMPLEMENTED_AUCTION_TYPES.includes(type) ? "" : " (coming soon)"}
            </option>
          ))}
        </select>
        {auctionTypeUnsupported && (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {AUCTION_TYPE_LABELS[auctionType]} isn&apos;t implemented yet — switch to Live Auction
            to continue.
          </span>
        )}
      </label>
    </div>
  );
}
