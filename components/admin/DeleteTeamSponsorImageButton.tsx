"use client";

import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteTeamSponsorImageButton({ teamId }: { teamId: string }) {
  return (
    <ConfirmDeleteButton
      confirmMessage="Delete this team's sponsor picture?"
      action={async () => {
        const res = await fetch(`/api/teams/${teamId}/sponsor-image`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Failed to delete");
        }
      }}
    />
  );
}
