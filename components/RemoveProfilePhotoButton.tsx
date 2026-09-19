"use client";

import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function RemoveProfilePhotoButton({
  actionUrl,
  confirmMessage,
}: {
  actionUrl: string;
  confirmMessage: string;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={confirmMessage}
      label="Remove"
      loadingLabel="Removing…"
      action={async () => {
        const res = await fetch(actionUrl, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Failed to remove");
        }
      }}
    />
  );
}
