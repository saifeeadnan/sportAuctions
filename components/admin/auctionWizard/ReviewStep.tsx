import { card, buttonPrimary } from "@/lib/ui";
import { AUCTION_TYPE_LABELS, type AuctionType } from "@/lib/auctionTypes";
import { ON_CLOCK_TEMPLATE_LABELS, ON_CLOCK_FIELD_LABELS, type OnClockTemplate, type OnClockFieldKey } from "@/lib/onClockDisplay";
import type { WizardCategory } from "@/components/admin/auctionWizard/CategoriesStep";

export function ReviewStep({
  name,
  teamBudget,
  auctionType,
  categories,
  assignedPlayerCount,
  totalPlayerCount,
  skipPreAuctionDraft,
  onClockTemplate,
  onClockVisibleFields,
  lotTimerEnabled,
  lotTimerSeconds,
  reAuctionEnabled,
  reAuctionDiscountPercent,
  error,
  loading,
  onSubmit,
}: {
  name: string;
  teamBudget: string;
  auctionType: AuctionType;
  categories: WizardCategory[];
  assignedPlayerCount: number;
  totalPlayerCount: number;
  skipPreAuctionDraft: boolean;
  onClockTemplate: OnClockTemplate;
  onClockVisibleFields: OnClockFieldKey[];
  lotTimerEnabled: boolean;
  lotTimerSeconds: string;
  reAuctionEnabled: boolean;
  reAuctionDiscountPercent: string;
  error: string | null;
  loading: boolean;
  onSubmit: () => void;
}) {
  const namedCategories = categories.filter((c) => c.name.trim());

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <div className={`${card} p-4 flex flex-col gap-3 text-sm`}>
        <div>
          <p className="text-black/50 dark:text-white/50">Auction</p>
          <p className="font-medium">{name || "(untitled)"}</p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Team budget &amp; type</p>
          <p className="font-medium">
            {teamBudget || "—"} &middot; {AUCTION_TYPE_LABELS[auctionType]}
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Categories ({namedCategories.length})</p>
          <ul className="list-disc list-inside">
            {namedCategories.map((c) => (
              <li key={c.name}>
                {c.name} &middot; base {c.basePrice || "—"}
                {c.bidIncrement.trim() ? ` · +${c.bidIncrement}` : ""}
                {!c.preAuctionEligible && " · live bidding only"}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Player pool</p>
          <p className="font-medium">
            {assignedPlayerCount} of {totalPlayerCount} players assigned to a category
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Pre-auction draft</p>
          <p className="font-medium">{skipPreAuctionDraft ? "Skipped — straight to bidding" : "Required"}</p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">On-the-clock display</p>
          <p className="font-medium">
            {ON_CLOCK_TEMPLATE_LABELS[onClockTemplate]}
            {onClockVisibleFields.length > 0
              ? ` · ${onClockVisibleFields.map((f) => ON_CLOCK_FIELD_LABELS[f]).join(", ")}`
              : " · no optional fields shown"}
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Bidding timer</p>
          <p className="font-medium">
            {lotTimerEnabled ? `${lotTimerSeconds || "—"}s per bid` : "No timer"}
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Re-auction of unsold players</p>
          <p className="font-medium">
            {reAuctionEnabled
              ? `Enabled — ${reAuctionDiscountPercent || "—"}% off on first re-offer`
              : "Full price (default)"}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="button" onClick={onSubmit} disabled={loading} className={`${buttonPrimary} self-start`}>
        {loading ? "Creating…" : "Create auction"}
      </button>
    </div>
  );
}
