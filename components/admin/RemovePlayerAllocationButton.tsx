"use client";

import { removePlayerFromTeamAction } from "@/lib/actions/bidding.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function RemovePlayerAllocationButton({
  auctionId,
  auctionPlayerId,
  playerName,
  teamName,
  readOnly = false,
}: {
  auctionId: string;
  auctionPlayerId: string;
  playerName: string;
  teamName: string;
  readOnly?: boolean;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Remove ${playerName} from ${teamName} and return them to the pool? The team's budget and slot will be refunded.`}
      action={() => removePlayerFromTeamAction(auctionId, auctionPlayerId)}
      disabledReason={readOnly ? "This league is read-only" : undefined}
      label="Remove"
      loadingLabel="Removing…"
    />
  );
}
