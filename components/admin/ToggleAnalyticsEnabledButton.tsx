"use client";

import { setAnalyticsEnabledAction } from "@/lib/actions/auctionAnalyticsEntitlement.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function ToggleAnalyticsEnabledButton({
  auctionId,
  teamAuctionEntryId,
  teamName,
  isEnabled,
}: {
  auctionId: string;
  teamAuctionEntryId: string;
  teamName: string;
  isEnabled: boolean;
}) {
  if (isEnabled) {
    return (
      <ConfirmDeleteButton
        confirmMessage={`Turn off the analytics dashboard for "${teamName}"? Their manager will lose access to it immediately.`}
        action={() => setAnalyticsEnabledAction(auctionId, teamAuctionEntryId, false)}
        label="Disable"
        loadingLabel="Disabling…"
        className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline underline-offset-2 transition-colors disabled:opacity-50"
      />
    );
  }

  return (
    <ConfirmDeleteButton
      confirmMessage={`Turn on the analytics dashboard for "${teamName}"?`}
      action={() => setAnalyticsEnabledAction(auctionId, teamAuctionEntryId, true)}
      label="Enable"
      loadingLabel="Enabling…"
      className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-2 transition-colors disabled:opacity-50"
    />
  );
}
