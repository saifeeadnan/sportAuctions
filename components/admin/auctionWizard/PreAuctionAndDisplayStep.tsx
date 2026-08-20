import { card } from "@/lib/ui";
import type { OnClockTemplate, OnClockFieldKey } from "@/lib/onClockDisplay";
import { OnClockDisplayPicker } from "@/components/admin/OnClockDisplayPicker";

export function PreAuctionAndDisplayStep({
  skipPreAuctionDraft,
  onSkipPreAuctionDraftChange,
  onClockTemplate,
  onOnClockTemplateChange,
  onClockVisibleFields,
  onOnClockVisibleFieldsChange,
}: {
  skipPreAuctionDraft: boolean;
  onSkipPreAuctionDraftChange: (v: boolean) => void;
  onClockTemplate: OnClockTemplate;
  onOnClockTemplateChange: (t: OnClockTemplate) => void;
  onClockVisibleFields: OnClockFieldKey[];
  onOnClockVisibleFieldsChange: (fields: OnClockFieldKey[]) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className={`${card} p-4 max-w-lg`}>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={skipPreAuctionDraft}
            onChange={(e) => onSkipPreAuctionDraftChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Skip the pre-auction draft</span>
            <br />
            <span className="text-black/60 dark:text-white/60">
              Teams go straight into live bidding once this auction starts — no private draft
              phase beforehand. You can&apos;t change this after the auction is created.
            </span>
          </span>
        </label>
      </div>

      <div className={`${card} p-4`}>
        <h2 className="text-sm font-medium mb-3">On-the-clock display</h2>
        <p className="text-sm text-black/60 dark:text-white/60 mb-3">
          How the player currently up for bid is shown during live bidding. You can change this
          any time later, including mid-auction, from the auction&apos;s Settings.
        </p>
        <OnClockDisplayPicker
          template={onClockTemplate}
          onTemplateChange={onOnClockTemplateChange}
          visibleFields={onClockVisibleFields}
          onVisibleFieldsChange={onOnClockVisibleFieldsChange}
        />
      </div>
    </div>
  );
}
