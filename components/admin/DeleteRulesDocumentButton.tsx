"use client";

import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteRulesDocumentButton({ tournamentId }: { tournamentId: string }) {
  return (
    <ConfirmDeleteButton
      confirmMessage="Delete the rules document for this tournament?"
      action={async () => {
        const res = await fetch(`/api/tournaments/${tournamentId}/rules`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Failed to delete");
        }
      }}
    />
  );
}
