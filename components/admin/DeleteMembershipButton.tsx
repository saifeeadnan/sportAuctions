"use client";

import { deleteMembershipAction } from "@/lib/actions/auth.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteMembershipButton({
  membershipId,
  userName,
  isSelf,
  readOnly,
}: {
  membershipId: string;
  userName: string;
  isSelf: boolean;
  /** True when this league is read-only (past its end date). */
  readOnly?: boolean;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Remove "${userName}" from this league? Their account and any other leagues they're in are unaffected.`}
      action={() => deleteMembershipAction(membershipId)}
      disabledReason={
        isSelf
          ? "You cannot remove your own access"
          : readOnly
            ? "This league is read-only"
            : undefined
      }
    />
  );
}
