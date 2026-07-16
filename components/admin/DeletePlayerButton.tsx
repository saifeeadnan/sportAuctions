"use client";

import { deletePlayerAction } from "@/lib/actions/roster.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeletePlayerButton({
  rosterId,
  playerId,
  playerName,
}: {
  rosterId: string;
  playerId: string;
  playerName: string;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete player "${playerName}"? This cannot be undone.`}
      action={() => deletePlayerAction(rosterId, playerId)}
    />
  );
}
