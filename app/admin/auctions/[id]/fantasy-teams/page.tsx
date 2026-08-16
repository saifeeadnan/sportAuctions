import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { getFantasyStandings } from "@/lib/services/fantasyTeam.service";
import { RosterRibbon } from "@/components/roster/RosterRibbon";
import { DeleteFantasyTeamButton } from "@/components/admin/DeleteFantasyTeamButton";
import { UploadPointsForm } from "@/components/admin/UploadPointsForm";
import { card } from "@/lib/ui";

export default async function FantasyTeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { leagueIds } = await requireAdminOrLeagueAdmin();

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: { tournament: true },
  });
  if (!auction) notFound();
  assertInScope(leagueIds, auction.tournament.leagueId);

  const { hasPoints, standings } = await getFantasyStandings(id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">Fantasy teams</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {auction.tournament.name} &middot; {auction.name} &middot; {standings.length}{" "}
          submitted
        </p>
      </div>

      <details className={card}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Upload player points
        </summary>
        <UploadPointsForm auctionId={auction.id} />
      </details>

      {standings.length === 0 ? (
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
          {standings.map(({ team, totalSpend, totalPoints, selfAuctionPlayerId, rank }) => (
            <details key={team.id} className={card}>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 flex-wrap">
                <span>
                  #{rank} &middot; {team.user.name}{" "}
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
                  spent {totalSpend}
                </span>
              </summary>
              <div className="px-4 pb-4 flex flex-col gap-3">
                <div className="flex items-center justify-end gap-3">
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
