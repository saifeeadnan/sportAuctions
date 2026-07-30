"use client";

import { setUserActiveAction } from "@/lib/actions/auth.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function ToggleUserActiveButton({
  userId,
  userName,
  isActive,
  isSelf,
}: {
  userId: string;
  userName: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  if (isActive) {
    return (
      <ConfirmDeleteButton
        confirmMessage={`Disable "${userName}"'s access? They will not be able to log in until re-enabled.`}
        action={() => setUserActiveAction(userId, false)}
        disabledReason={isSelf ? "You cannot disable your own account" : undefined}
        label="Disable"
        loadingLabel="Disabling…"
        className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline underline-offset-2 transition-colors disabled:opacity-50"
      />
    );
  }

  return (
    <ConfirmDeleteButton
      confirmMessage={`Re-enable "${userName}"'s access?`}
      action={() => setUserActiveAction(userId, true)}
      label="Enable"
      loadingLabel="Enabling…"
      className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-2 transition-colors disabled:opacity-50"
    />
  );
}
