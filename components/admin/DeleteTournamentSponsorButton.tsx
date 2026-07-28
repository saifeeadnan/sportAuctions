"use client";

import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteTournamentSponsorButton({
  sponsorId,
  sponsorName,
}: {
  sponsorId: string;
  sponsorName: string;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Remove sponsor "${sponsorName}"?`}
      action={async () => {
        const res = await fetch(`/api/tournament-sponsors/${sponsorId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Failed to remove sponsor");
        }
      }}
      label="×"
      loadingLabel="…"
      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 leading-none transition-colors disabled:opacity-50"
    />
  );
}
