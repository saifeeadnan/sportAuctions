"use client";

import { setMembershipActiveAction } from "@/lib/actions/auth.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function ToggleMembershipActiveButton({
  membershipId,
  userName,
  isActive,
  isSelf,
}: {
  membershipId: string;
  userName: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  if (isActive) {
    return (
      <ConfirmDeleteButton
        confirmMessage={`Revoke "${userName}"'s access to this league? They will not be able to use it until re-approved.`}
        action={() => setMembershipActiveAction(membershipId, false)}
        disabledReason={isSelf ? "You cannot revoke your own access" : undefined}
        label="Revoke"
        loadingLabel="Revoking…"
        className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline underline-offset-2 transition-colors disabled:opacity-50"
      />
    );
  }

  return (
    <ConfirmDeleteButton
      confirmMessage={`Approve "${userName}"'s access to this league?`}
      action={() => setMembershipActiveAction(membershipId, true)}
      label="Approve"
      loadingLabel="Approving…"
      className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-2 transition-colors disabled:opacity-50"
    />
  );
}
