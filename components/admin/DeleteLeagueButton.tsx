"use client";

import { deleteLeagueAction } from "@/lib/actions/league.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteLeagueButton({
  leagueId,
  leagueName,
  userCount,
  rosterCount,
  tournamentCount,
}: {
  leagueId: string;
  leagueName: string;
  userCount: number;
  rosterCount: number;
  tournamentCount: number;
}) {
  const inUse = userCount > 0 || rosterCount > 0 || tournamentCount > 0;

  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete league "${leagueName}"? This cannot be undone.`}
      action={() => deleteLeagueAction(leagueId)}
      disabledReason={
        inUse
          ? `Has ${userCount} user(s), ${rosterCount} roster(s), ${tournamentCount} tournament(s) — reassign or remove those first`
          : undefined
      }
    />
  );
}
