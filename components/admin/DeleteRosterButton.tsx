"use client";

import { deleteRosterAction } from "@/lib/actions/roster.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteRosterButton({
  rosterId,
  rosterName,
  inUseCount,
}: {
  rosterId: string;
  rosterName: string;
  inUseCount: number;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete roster "${rosterName}"? This cannot be undone.`}
      action={() => deleteRosterAction(rosterId)}
      disabledReason={
        inUseCount > 0 ? `Used by ${inUseCount} tournament(s) — delete those first` : undefined
      }
    />
  );
}
