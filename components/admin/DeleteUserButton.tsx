"use client";

import { deleteUserAction } from "@/lib/actions/auth.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteUserButton({
  userId,
  userName,
  isSelf,
  readOnly,
}: {
  userId: string;
  userName: string;
  isSelf: boolean;
  /** True when this user's own league is read-only (past its end date). */
  readOnly?: boolean;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete user "${userName}"? This cannot be undone.`}
      action={() => deleteUserAction(userId)}
      disabledReason={
        isSelf
          ? "You cannot delete your own account"
          : readOnly
            ? "This league is read-only"
            : undefined
      }
    />
  );
}
