import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { ConfirmedRosterTable } from "@/components/roster/ConfirmedRosterTable";
import { UploadTeamSponsorImageForm } from "@/components/admin/UploadTeamSponsorImageForm";
import { DeleteTeamSponsorImageButton } from "@/components/admin/DeleteTeamSponsorImageButton";
import { card } from "@/lib/ui";

export default async function TournamentTeamRosterPage({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id, teamId } = await params;
  const { leagueIds } = await requireAdminOrLeagueAdmin();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      tournament: true,
      manager: true,
      sponsorImage: { select: { id: true } },
      entries: {
        include: {
          auction: true,
          playersWon: { include: { player: true, category: true }, orderBy: { player: { name: "asc" } } },
        },
        orderBy: { auction: { createdAt: "desc" } },
      },
    },
  });
  if (!team || team.tournamentId !== id) notFound();
  assertInScope(leagueIds, team.tournament.leagueId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">{team.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {team.tournament.name} &middot;{" "}
          {team.manager ? `Manager: ${team.manager.name}` : "No manager assigned"}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Sponsor picture</h2>
        <div className={`${card} px-4 py-3 flex items-center justify-between gap-4 flex-wrap mb-3`}>
          {team.sponsorImage ? (
            <>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/teams/${team.id}/sponsor-image`}
                  alt={`${team.name} sponsor`}
                  className="h-16 w-16 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1"
                />
              </div>
              <DeleteTeamSponsorImageButton teamId={team.id} />
            </>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">
              No sponsor picture uploaded yet.
            </p>
          )}
        </div>
        <details className={card}>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            {team.sponsorImage ? "Replace sponsor picture" : "Upload sponsor picture"}
          </summary>
          <div className="px-4 pb-4">
            <UploadTeamSponsorImageForm teamId={team.id} />
          </div>
        </details>
      </section>

      {team.entries.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          This team hasn&apos;t participated in an auction yet.
        </p>
      ) : (
        team.entries.map((entry) => (
          <section key={entry.id}>
            <h2 className="text-lg font-medium mb-1">{entry.auction.name}</h2>
            <p className="text-sm text-black/60 dark:text-white/60 mb-3">
              Status: {entry.status} &middot; Budget remaining: {String(entry.budgetRemaining)}{" "}
              &middot; Slots: {entry.slotsFilled}/{entry.slotsTotal}
            </p>
            <ConfirmedRosterTable
              players={entry.playersWon.map((ap) => ({
                id: ap.id,
                playerName: ap.player.name,
                photoUrl: ap.player.photoUrl,
                categoryName: ap.category.name,
                soldPrice: ap.soldPrice != null ? String(ap.soldPrice) : null,
                soldVia: ap.soldVia,
              }))}
            />
            <Link
              href={`/admin/auctions/${entry.auctionId}/teams/${entry.id}`}
              className="text-sm underline underline-offset-2 mt-2 inline-block"
            >
              View full details for this auction
            </Link>
          </section>
        ))
      )}

      <Link href={`/admin/tournaments/${id}`} className="text-sm underline underline-offset-2">
        Back to tournament
      </Link>
    </div>
  );
}
