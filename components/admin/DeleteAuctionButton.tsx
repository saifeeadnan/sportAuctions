"use client";

import { deleteAuctionAction } from "@/lib/actions/auction.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteAuctionButton({
  auctionId,
  auctionName,
  status,
}: {
  auctionId: string;
  auctionName: string;
  status: string;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete auction "${auctionName}"? This cannot be undone.`}
      action={() => deleteAuctionAction(auctionId)}
      disabledReason={status === "BIDDING" ? "This auction is currently in progress" : undefined}
    />
  );
}
