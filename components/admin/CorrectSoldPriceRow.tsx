"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { correctSoldPriceAction } from "@/lib/actions/auctionCorrection.actions";
import type { CorrectSoldPriceResult } from "@/lib/services/auctionCorrection.service";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

type Confirmation = Extract<CorrectSoldPriceResult, { status: "needs_confirmation" }>;

export function CorrectSoldPriceRow({
  auctionId,
  auctionPlayerId,
  playerName,
  teamName,
  currentPrice,
}: {
  auctionId: string;
  auctionPlayerId: string;
  playerName: string;
  teamName: string;
  currentPrice: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(currentPrice);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setPrice(currentPrice);
    setConfirmation(null);
    setBudgetInput("");
    setError(null);
  }

  async function handleSave() {
    if (!price.trim()) return;
    setLoading(true);
    setError(null);
    const result = await correctSoldPriceAction(auctionId, auctionPlayerId, Number(price));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data!.status === "needs_confirmation") {
      setConfirmation(result.data!);
      setBudgetInput(result.data!.suggestedBudget);
      return;
    }
    reset();
    router.refresh();
  }

  async function handleConfirm() {
    if (!budgetInput.trim()) return;
    setLoading(true);
    setError(null);
    const result = await correctSoldPriceAction(
      auctionId,
      auctionPlayerId,
      Number(price),
      Number(budgetInput)
    );
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">
          {playerName} <span className="text-black/50 dark:text-white/50">&middot; {teamName}</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-black/60 dark:text-white/60">{currentPrice}</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">
          {playerName} <span className="text-black/50 dark:text-white/50">&middot; {teamName}</span>
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`${inputClass} py-1 text-xs w-28`}
            disabled={confirmation != null}
          />
          {confirmation == null && (
            <>
              <button
                type="button"
                disabled={loading || !price.trim()}
                onClick={handleSave}
                className={`${buttonPrimary} px-2 py-1 text-xs`}
              >
                {loading ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={reset} className={`${buttonSecondary} px-2 py-1 text-xs`}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {confirmation && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col gap-2">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This would put <span className="font-semibold">{confirmation.teamName}</span> over its
            current budget of {confirmation.currentBudget}. Raise the auction&apos;s team budget to:
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min={0}
              step="0.01"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className={`${inputClass} py-1 text-xs w-32`}
            />
            <button
              type="button"
              disabled={loading || !budgetInput.trim()}
              onClick={handleConfirm}
              className={`${buttonPrimary} px-2 py-1 text-xs`}
            >
              {loading ? "Saving…" : "Confirm correction + raise budget"}
            </button>
            <button type="button" onClick={reset} className={`${buttonSecondary} px-2 py-1 text-xs`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
