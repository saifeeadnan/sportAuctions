"use client";

import { adminRemoveDraftPickAction } from "@/lib/actions/auction.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteDraftPickButton({
  auctionId,
  teamAuctionEntryId,
  auctionPlayerId,
  playerName,
}: {
  auctionId: string;
  teamAuctionEntryId: string;
  auctionPlayerId: string;
  playerName: string;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Remove "${playerName}" from this team's draft picks?`}
      action={() => adminRemoveDraftPickAction(auctionId, teamAuctionEntryId, auctionPlayerId)}
    />
  );
}
