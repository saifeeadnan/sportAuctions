"use client";

import { deleteTournamentAction } from "@/lib/actions/tournament.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteTournamentButton({
  tournamentId,
  tournamentName,
  teamCount,
  auctionCount,
  hasLiveAuction,
}: {
  tournamentId: string;
  tournamentName: string;
  teamCount: number;
  auctionCount: number;
  hasLiveAuction: boolean;
}) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete tournament "${tournamentName}"? This will also delete ${teamCount} team(s) and ${auctionCount} auction(s). This cannot be undone.`}
      action={() => deleteTournamentAction(tournamentId)}
      disabledReason={
        hasLiveAuction ? "An auction in this tournament is currently in progress" : undefined
      }
    />
  );
}
