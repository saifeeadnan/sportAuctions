import type { AuctionStatePlayer } from "@/lib/services/auctionState.service";
import {
  ON_CLOCK_TEMPLATES,
  ON_CLOCK_TEMPLATE_LABELS,
  ON_CLOCK_TEMPLATE_DESCRIPTIONS,
  ON_CLOCK_FIELD_KEYS,
  ON_CLOCK_FIELD_LABELS,
  type OnClockTemplate,
  type OnClockFieldKey,
} from "@/lib/onClockDisplay";
import { card } from "@/lib/ui";
import { OnClockCard } from "@/components/auction/OnClockCard";

// Fixed fixture used to render a pixel-accurate preview of each
// template/field combination — never real auction data.
const SAMPLE_PLAYER: AuctionStatePlayer = {
  id: "sample",
  name: "Jordan Rivers",
  position: "All-rounder",
  age: 27,
  photoUrl: null,
  previousTeam: "Riverside Titans",
  categoryName: "Gold",
  basePrice: "5,000",
  bidIncrement: "500",
  status: "IN_BIDDING",
  soldPrice: null,
  soldToEntryId: null,
  soldToTeamName: null,
  soldVia: null,
  soldAt: null,
  currentBid: "6,500",
  currentBidderEntryId: "sample-team",
  currentBidderTeamName: "Sample FC",
  bidCount: 3,
  bidCooldownUntil: null,
  lotTimerDeadline: null,
  rating: "8.2",
  battingRating: "8.5",
  bowlingRating: "6.0",
  fieldingRating: "7.8",
};

export function OnClockDisplayPicker({
  template,
  onTemplateChange,
  visibleFields,
  onVisibleFieldsChange,
}: {
  template: OnClockTemplate;
  onTemplateChange: (t: OnClockTemplate) => void;
  visibleFields: OnClockFieldKey[];
  onVisibleFieldsChange: (fields: OnClockFieldKey[]) => void;
}) {
  function toggleField(key: OnClockFieldKey) {
    onVisibleFieldsChange(
      visibleFields.includes(key) ? visibleFields.filter((f) => f !== key) : [...visibleFields, key]
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Template</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {ON_CLOCK_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTemplateChange(t)}
              className={`${card} p-3 flex flex-col gap-2 text-left transition-colors ${
                template === t
                  ? "ring-2 ring-indigo-500/60 border-indigo-500/40"
                  : "hover:border-black/15 dark:hover:border-white/20"
              }`}
            >
              <OnClockCard
                player={SAMPLE_PLAYER}
                template={t}
                visibleFields={visibleFields}
                photoWidth={64}
                photoHeight={86}
              />
              <div>
                <p className="text-sm font-medium">{ON_CLOCK_TEMPLATE_LABELS[t]}</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {ON_CLOCK_TEMPLATE_DESCRIPTIONS[t]}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Player fields to show</h3>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ON_CLOCK_FIELD_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={visibleFields.includes(key)}
                onChange={() => toggleField(key)}
              />
              {ON_CLOCK_FIELD_LABELS[key]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Preview</h3>
        <div className="max-w-xs">
          <OnClockCard
            player={SAMPLE_PLAYER}
            template={template}
            visibleFields={visibleFields}
            photoWidth={96}
            photoHeight={128}
          />
        </div>
      </div>
    </div>
  );
}
