import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import {
  getFantasyEligibility,
  getFantasyTeam,
  listFantasyPlayerPool,
} from "@/lib/services/fantasyTeam.service";
import { FantasyTeamForm } from "@/components/viewer/FantasyTeamForm";
import { RosterRibbon } from "@/components/roster/RosterRibbon";
import { TeamStrengthSummary } from "@/components/manager/TeamStrengthSummary";
import type { RatedPlayer } from "@/lib/teamStrength";

function toRatedPlayer(player: {
  position: string | null;
  rating: unknown;
  battingRating: unknown;
  bowlingRating: unknown;
  fieldingRating: unknown;
}): RatedPlayer {
  return {
    position: player.position,
    rating: player.rating != null ? String(player.rating) : null,
    battingRating: player.battingRating != null ? String(player.battingRating) : null,
    bowlingRating: player.bowlingRating != null ? String(player.bowlingRating) : null,
    fieldingRating: player.fieldingRating != null ? String(player.fieldingRating) : null,
  };
}

export default async function FantasyTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole("VIEWER");

  const eligibility = await getFantasyEligibility(id, session.user.id);
  if (!eligibility.eligible) {
    if (eligibility.reason === "Auction not found") notFound();
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-black/60 dark:text-white/60">{eligibility.reason}</p>
      </div>
    );
  }

  const { auction } = eligibility;
  const existingTeam = await getFantasyTeam(id, session.user.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">Fantasy team</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {auction.tournament.name} &middot; {auction.name} &middot; budget:{" "}
          {String(auction.teamBudget)}
        </p>
      </div>

      {existingTeam ? (
        <>
          <p className="text-sm text-black/60 dark:text-white/60">
            Your fantasy team is locked in — {existingTeam.picks.length} player(s), total spend{" "}
            {existingTeam.picks.reduce((sum, p) => sum + Number(p.price), 0)}.
          </p>
          <TeamStrengthSummary
            players={existingTeam.picks.map((p) => toRatedPlayer(p.auctionPlayer.player))}
          />
          <RosterRibbon
            grid
            highlightId={eligibility.selfAuctionPlayerId}
            players={existingTeam.picks.map((p) => ({
              id: p.auctionPlayerId,
              playerName: p.auctionPlayer.player.name,
              photoUrl: p.auctionPlayer.player.photoUrl,
              position: p.auctionPlayer.player.position,
              soldPrice: String(p.price),
            }))}
          />
        </>
      ) : (
        <FantasyTeamForm
          auctionId={auction.id}
          cap={auction.tournament.squadSize}
          budget={String(auction.teamBudget)}
          players={await listFantasyPlayerPool(auction.id)}
          lockedPlayerId={eligibility.selfAuctionPlayerId}
        />
      )}
    </div>
  );
}
