"use client";

import { deleteTeamAction } from "@/lib/actions/tournament.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteTeamButton({
  teamId,
  teamName,
  entryCount,
  compact = false,
}: {
  teamId: string;
  teamName: string;
  entryCount: number;
  compact?: boolean;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete team "${teamName}"? This cannot be undone.`}
      action={() => deleteTeamAction(teamId)}
      disabledReason={
        entryCount > 0 ? `Used in ${entryCount} auction(s) — remove those first` : undefined
      }
      label={compact ? "×" : "Delete"}
      loadingLabel={compact ? "…" : "Deleting…"}
      className={
        compact
          ? "flex h-6 w-6 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 leading-none transition-colors disabled:opacity-50"
          : undefined
      }
    />
  );
}
