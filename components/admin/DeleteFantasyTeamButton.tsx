"use client";

import { adminDeleteFantasyTeamAction } from "@/lib/actions/fantasyTeam.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteFantasyTeamButton({
  auctionId,
  fantasyTeamId,
  viewerName,
}: {
  auctionId: string;
  fantasyTeamId: string;
  viewerName: string;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete ${viewerName}'s fantasy team? This cannot be undone.`}
      action={() => adminDeleteFantasyTeamAction(auctionId, fantasyTeamId)}
    />
  );
}
