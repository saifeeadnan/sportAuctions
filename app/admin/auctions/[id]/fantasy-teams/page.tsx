import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { listFantasyTeamsForAuction } from "@/lib/services/fantasyTeam.service";
import { computeTeamStrength, type RatedPlayer } from "@/lib/teamStrength";
import { RosterRibbon } from "@/components/roster/RosterRibbon";
import { DeleteFantasyTeamButton } from "@/components/admin/DeleteFantasyTeamButton";
import { UploadPointsForm } from "@/components/admin/UploadPointsForm";
import { card } from "@/lib/ui";

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

export default async function FantasyTeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { leagueId } = await requireAdminOrLeagueAdmin();

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: { tournament: true },
  });
  if (!auction) notFound();
  assertInScope(leagueId, auction.tournament.leagueId);

  const [fantasyTeams, pointsUploadedCount] = await Promise.all([
    listFantasyTeamsForAuction(id),
    prisma.auctionPlayer.count({ where: { auctionId: id, points: { not: null } } }),
  ]);
  const hasPoints = pointsUploadedCount > 0;

  const ranked = fantasyTeams
    .map((team) => {
      const strength = computeTeamStrength(team.picks.map((p) => toRatedPlayer(p.auctionPlayer.player)));
      const totalSpend = team.picks.reduce((sum, p) => sum + Number(p.price), 0);
      const totalPoints = team.picks.reduce(
        (sum, p) => sum + (p.auctionPlayer.points != null ? Number(p.auctionPlayer.points) : 0),
        0
      );
      const selfPick = team.picks.find(
        (p) =>
          p.auctionPlayer.player.loginId?.toLowerCase() === team.user.loginId?.toLowerCase()
      );
      return {
        team,
        strength,
        totalSpend,
        totalPoints,
        selfAuctionPlayerId: selfPick?.auctionPlayerId,
      };
    })
    .sort((a, b) =>
      hasPoints ? b.totalPoints - a.totalPoints : b.strength.teamStrength - a.strength.teamStrength
    );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">Fantasy teams</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {auction.tournament.name} &middot; {auction.name} &middot; {fantasyTeams.length}{" "}
          submitted
        </p>
      </div>

      <details className={card}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Upload player points
        </summary>
        <UploadPointsForm auctionId={auction.id} />
      </details>

      {ranked.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          No fantasy teams have been submitted for this auction yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-black/50 dark:text-white/50">
            {hasPoints
              ? "Ranked by total points."
              : "Points haven't been uploaded yet — ranked by team strength in the meantime."}
          </p>
          {ranked.map(({ team, strength, totalSpend, totalPoints, selfAuctionPlayerId }, i) => (
            <details key={team.id} className={card}>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 flex-wrap">
                <span>
                  #{i + 1} &middot; {team.user.name}{" "}
                  <span className="text-black/50 dark:text-white/50">
                    ({team.user.loginId})
                  </span>
                </span>
                <span className="text-black/60 dark:text-white/60 font-normal">
                  {hasPoints && (
                    <>
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">
                        {totalPoints} pts
                      </span>{" "}
                      &middot;{" "}
                    </>
                  )}
                  spent {totalSpend} &middot; strength {strength.teamStrength.toFixed(1)}/10
                </span>
              </summary>
              <div className="px-4 pb-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-black/50 dark:text-white/50">
                    Batsmen: {strength.positionCounts.Batsmen} &middot; Bowlers:{" "}
                    {strength.positionCounts.Bowlers} &middot; All-rounders:{" "}
                    {strength.positionCounts["All-rounders"]}
                    {strength.positionCounts.Other > 0
                      ? ` · Other: ${strength.positionCounts.Other}`
                      : ""}
                  </p>
                  <DeleteFantasyTeamButton
                    auctionId={auction.id}
                    fantasyTeamId={team.id}
                    viewerName={team.user.name}
                  />
                </div>
                <RosterRibbon
                  grid
                  highlightId={selfAuctionPlayerId}
                  players={team.picks.map((p) => ({
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
          ))}
        </div>
      )}

      <Link href={`/admin/auctions/${auction.id}`} className="text-sm underline underline-offset-2">
        Back to auction
      </Link>
    </div>
  );
}
