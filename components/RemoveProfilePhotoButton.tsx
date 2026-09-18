"use client";

import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function RemoveProfilePhotoButton({ userId }: { userId: string }) {
  return (
    <ConfirmDeleteButton
      confirmMessage="Remove your profile picture?"
      label="Remove"
      loadingLabel="Removing…"
      action={async () => {
        const res = await fetch(`/api/users/${userId}/photo`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Failed to remove");
        }
      }}
    />
  );
}
