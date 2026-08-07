"use client";

import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteLeagueLogoButton({ leagueId }: { leagueId: string }) {
  return (
    <ConfirmDeleteButton
      confirmMessage="Delete this league's logo?"
      action={async () => {
        const res = await fetch(`/api/leagues/${leagueId}/logo`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Failed to delete");
        }
      }}
    />
  );
}
