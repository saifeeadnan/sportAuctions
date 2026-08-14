import { notFound } from "next/navigation";
import { requireRole, scopeLeagueId } from "@/lib/auth/guards";
import {
  getFantasyEligibility,
  getFantasyTeam,
  getFantasyStandings,
  listFantasyPlayerPool,
  isFantasyEditingLocked,
  getMaxRosterSize,
} from "@/lib/services/fantasyTeam.service";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { FantasyTeamForm } from "@/components/viewer/FantasyTeamForm";
import { RosterRibbon } from "@/components/roster/RosterRibbon";
import { TeamStrengthSummary } from "@/components/manager/TeamStrengthSummary";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";
import { Badge } from "@/components/ui/Badge";
import { card } from "@/lib/ui";
import { formatCalendarDate } from "@/lib/dates";
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
  const session = await requireRole("VIEWER", "TEAM_MANAGER");

  const eligibility = await getFantasyEligibility(id, session.user.id, scopeLeagueId(session));
  if (!eligibility.eligible) {
    if (eligibility.reason === "Auction not found") notFound();
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-black/60 dark:text-white/60">{eligibility.reason}</p>
      </div>
    );
  }

  const { auction } = eligibility;
  const locked = isFantasyEditingLocked(auction.tournament);
  const existingTeam = await getFantasyTeam(id, session.user.id);
  const standings = existingTeam ? await getFantasyStandings(id) : null;
  const myStanding = standings?.standings.find((s) => s.team.userId === session.user.id);
  const sponsors = await listTournamentSponsors(auction.tournament.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
      <p className="text-sm text-black/60 dark:text-white/60">
        {auction.tournament.league.name} / {auction.tournament.name} / {auction.name}
        {!locked && <> &middot; Editable until {formatCalendarDate(auction.tournament.startDate)}.</>}
        {locked && <> &middot; budget: {String(auction.teamBudget)}</>}
      </p>

      {locked && !existingTeam && (
        <p className="text-black/60 dark:text-white/60">
          You didn&apos;t save a fantasy team in time.
        </p>
      )}

      {locked && existingTeam ? (
        <>
          <p className="text-sm text-black/60 dark:text-white/60">
            Locked in — {existingTeam.picks.length} player(s), total spend{" "}
            {existingTeam.picks.reduce((sum, p) => sum + Number(p.price), 0)}.
          </p>

          {myStanding && standings && (
            <div className={`${card} px-4 py-3 flex items-center justify-between gap-3 flex-wrap`}>
              <div className="flex items-center gap-2">
                <Badge variant="info">
                  #{myStanding.rank} of {standings.standings.length}
                </Badge>
                <span className="text-sm text-black/60 dark:text-white/60">current standing</span>
              </div>
              <span className="text-sm text-black/60 dark:text-white/60">
                {standings.hasPoints ? (
                  <>
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">
                      {myStanding.totalPoints} pts
                    </span>{" "}
                    &middot; strength {myStanding.strength.teamStrength.toFixed(1)}/10
                  </>
                ) : (
                  <>
                    Points not uploaded yet &middot; strength{" "}
                    {myStanding.strength.teamStrength.toFixed(1)}/10
                  </>
                )}
              </span>
            </div>
          )}

          <TeamStrengthSummary
            players={existingTeam.picks.map((p) => toRatedPlayer(p.auctionPlayer.player))}
            squadSize={auction.tournament.squadSize}
          />
          <details className={card} open>
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              Your fantasy team ({existingTeam.picks.length})
            </summary>
            <div className="px-4 pb-4">
              <RosterRibbon
                grid
                highlightId={eligibility.selfAuctionPlayerId}
                players={existingTeam.picks.map((p) => ({
                  id: p.auctionPlayerId,
                  playerName: p.auctionPlayer.player.name,
                  photoUrl: p.auctionPlayer.player.photoUrl,
                  position: p.auctionPlayer.player.position,
                  soldPrice: String(p.price),
                  points: p.auctionPlayer.points != null ? String(p.auctionPlayer.points) : null,
                }))}
              />
            </div>
          </details>
        </>
      ) : !locked ? (
        <FantasyTeamForm
          auctionId={auction.id}
          cap={await getMaxRosterSize(auction.id)}
          budget={String(auction.teamBudget)}
          players={await listFantasyPlayerPool(auction.id)}
          lockedPlayerId={eligibility.selfAuctionPlayerId}
          initialSelected={existingTeam?.picks.map((p) => p.auctionPlayerId) ?? []}
        />
      ) : null}

      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
