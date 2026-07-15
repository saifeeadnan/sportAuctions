"use client";

import { deleteUserAction } from "@/lib/actions/auth.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteUserButton({
  userId,
  userName,
  isSelf,
}: {
  userId: string;
  userName: string;
  isSelf: boolean;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete user "${userName}"? This cannot be undone.`}
      action={() => deleteUserAction(userId)}
      disabledReason={isSelf ? "You cannot delete your own account" : undefined}
    />
  );
}
