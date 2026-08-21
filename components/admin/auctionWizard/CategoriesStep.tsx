import { card, inputClass } from "@/lib/ui";

export type WizardCategory = {
  name: string;
  basePrice: string;
  preAuctionEligible: boolean;
  bidIncrement: string;
};

export function CategoriesStep({
  categories,
  skipPreAuctionDraft,
  onUpdateCategory,
  onToggleCategoryPreAuctionEligible,
  onAddCategory,
  onRemoveCategory,
}: {
  categories: WizardCategory[];
  /** When the whole auction skips pre-auction, no category can be
   * pre-auction-eligible either — there's no draft phase for it to matter
   * in, so the checkbox is shown grayed out and unchecked. */
  skipPreAuctionDraft: boolean;
  onUpdateCategory: (index: number, field: "name" | "basePrice" | "bidIncrement", value: string) => void;
  onToggleCategoryPreAuctionEligible: (index: number) => void;
  onAddCategory: () => void;
  onRemoveCategory: (index: number) => void;
}) {
  return (
    <div className={`${card} p-4 max-w-lg`}>
      <h2 className="text-sm font-medium mb-2">Categories &amp; base prices</h2>
      <div className="flex flex-col gap-2">
        {categories.map((cat, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex gap-2 items-center">
              <input
                placeholder="Category name (e.g. Icon)"
                value={cat.name}
                onChange={(e) => onUpdateCategory(i, "name", e.target.value)}
                className={`${inputClass} flex-1`}
              />
              <input
                placeholder="Base price"
                type="number"
                min={1}
                step="0.01"
                value={cat.basePrice}
                onChange={(e) => onUpdateCategory(i, "basePrice", e.target.value)}
                className={`${inputClass} w-28`}
              />
              <input
                placeholder="Bid increment (optional)"
                type="number"
                min={0}
                step="0.01"
                value={cat.bidIncrement}
                onChange={(e) => onUpdateCategory(i, "bidIncrement", e.target.value)}
                className={`${inputClass} w-36`}
              />
              {categories.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveCategory(i)}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <label
              className={`flex items-center gap-1.5 text-xs ${
                skipPreAuctionDraft
                  ? "text-black/30 dark:text-white/30"
                  : "text-black/60 dark:text-white/60"
              }`}
              title={
                skipPreAuctionDraft
                  ? "This auction skips the pre-auction draft entirely, so no category can be eligible for it"
                  : "If unchecked, players in this category can only be won through live bidding, not the pre-auction draft"
              }
            >
              <input
                type="checkbox"
                checked={!skipPreAuctionDraft && cat.preAuctionEligible}
                disabled={skipPreAuctionDraft}
                onChange={() => onToggleCategoryPreAuctionEligible(i)}
              />
              Allow pre-auction draft picks
            </label>
          </div>
        ))}
        <button
          type="button"
          onClick={onAddCategory}
          className="self-start text-sm underline underline-offset-2"
        >
          + Add category
        </button>
      </div>
    </div>
  );
}
