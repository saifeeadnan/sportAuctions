"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateFantasySettingsAction } from "@/lib/actions/fantasyTeam.actions";
import type { FantasyPricingModel } from "@/app/generated/prisma/client";
import { inputClass, selectClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

const PRICING_MODEL_LABELS: Record<FantasyPricingModel, string> = {
  SOLD_PRICE: "Sold price",
  CATEGORY_AVERAGE: "Category average price",
};

export function EditFantasySettingsForm({
  auctionId,
  pricingModel,
  selfPickRequired,
  maxTeamsPerUser,
  managersAllowed,
}: {
  auctionId: string;
  pricingModel: FantasyPricingModel;
  selfPickRequired: boolean;
  maxTeamsPerUser: number;
  managersAllowed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pricingModelValue, setPricingModelValue] = useState<FantasyPricingModel>(pricingModel);
  const [selfPickRequiredValue, setSelfPickRequiredValue] = useState(selfPickRequired);
  const [maxTeamsValue, setMaxTeamsValue] = useState(String(maxTeamsPerUser));
  const [managersAllowedValue, setManagersAllowedValue] = useState(managersAllowed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPricingModelValue(pricingModel);
    setSelfPickRequiredValue(selfPickRequired);
    setMaxTeamsValue(String(maxTeamsPerUser));
    setManagersAllowedValue(managersAllowed);
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
      >
        Fantasy settings ({PRICING_MODEL_LABELS[pricingModel]}
        {!selfPickRequired && ", self-pick optional"}
        {maxTeamsPerUser > 1 && `, up to ${maxTeamsPerUser} teams`}
        {managersAllowed && ", managers allowed"})
      </button>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const maxTeamsPerUserValue = Number(maxTeamsValue);
    const result = await updateFantasySettingsAction(auctionId, {
      pricingModel: pricingModelValue,
      selfPickRequired: selfPickRequiredValue,
      maxTeamsPerUser: maxTeamsPerUserValue,
      managersAllowed: managersAllowedValue,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 mt-2 mb-1 max-w-sm">
      <p className="text-xs text-black/60 dark:text-white/60">
        Controls how fantasy picks are priced and who can build a team for this auction.
      </p>
      <label className="flex flex-col gap-1 text-xs">
        Pricing model
        <select
          value={pricingModelValue}
          onChange={(e) => setPricingModelValue(e.target.value as FantasyPricingModel)}
          className={`${selectClass} py-1 text-xs`}
        >
          {Object.entries(PRICING_MODEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={selfPickRequiredValue}
          onChange={(e) => setSelfPickRequiredValue(e.target.checked)}
        />
        Require self-pick — a viewer must have been part of this auction's player pool to build a
        team, and their own player is force-included
      </label>
      <label className="flex items-center gap-2 text-xs">
        Max teams per person
        <input
          type="number"
          min={1}
          step="1"
          value={maxTeamsValue}
          onChange={(e) => setMaxTeamsValue(e.target.value)}
          className={`${inputClass} py-1 text-xs w-20`}
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={managersAllowedValue}
          onChange={(e) => setManagersAllowedValue(e.target.checked)}
        />
        Allow team managers to build a fantasy team — off by default, since fantasy teams are a
        viewer/spectator feature
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading || !maxTeamsValue.trim()}
          onClick={handleSave}
          className={`${buttonPrimary} px-2 py-1 text-xs`}
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className={`${buttonSecondary} px-2 py-1 text-xs`}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
