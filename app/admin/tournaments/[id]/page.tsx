import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { getRulesDocumentMeta } from "@/lib/services/tournamentDocument.service";
import { listTournamentSponsors, listKnownSponsors } from "@/lib/services/tournamentSponsor.service";
import { DeleteAuctionButton } from "@/components/admin/DeleteAuctionButton";
import { UploadRulesDocumentForm } from "@/components/admin/UploadRulesDocumentForm";
import { DeleteRulesDocumentButton } from "@/components/admin/DeleteRulesDocumentButton";
import { AddTeamForm } from "@/components/admin/AddTeamForm";
import { AttachRosterForm } from "@/components/admin/AttachRosterForm";
import { DeleteTeamButton } from "@/components/admin/DeleteTeamButton";
import { AddTournamentSponsorForm } from "@/components/admin/AddTournamentSponsorForm";
import { DeleteTournamentSponsorButton } from "@/components/admin/DeleteTournamentSponsorButton";
import { EditTournamentDatesForm } from "@/components/admin/EditTournamentDatesForm";
import { SponsorLink } from "@/components/tournament/SponsorLink";
import { toDateInputValue, formatCalendarDate } from "@/lib/dates";
import { card, cardInteractive } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

const AUCTION_STATUS_VARIANT: Record<string, "neutral" | "info" | "success" | "warning"> = {
  BIDDING: "info",
  COMPLETED: "success",
  PRE_AUCTION_OPEN: "warning",
  PRE_AUCTION_LOCKED: "warning",
};

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { leagueId } = await requireAdminOrLeagueAdmin();

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      roster: true,
      teams: {
        include: {
          manager: true,
          sponsorImage: { select: { id: true } },
          _count: { select: { entries: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!tournament) notFound();
  assertInScope(leagueId, tournament.leagueId);

  // Filtered by the tournament's own league (not the caller's) — a site ADMIN
  // editing one specific tournament should only see that league's managers.
  const [managers, auctions, rulesDocument, sponsors, knownSponsors, leagueRosters] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TEAM_MANAGER", leagueId: tournament.leagueId },
      orderBy: { name: "asc" },
    }),
    prisma.auction.findMany({ where: { tournamentId: id }, orderBy: { createdAt: "desc" } }),
    getRulesDocumentMeta(id),
    listTournamentSponsors(id),
    listKnownSponsors(id, leagueId),
    tournament.rosterId
      ? Promise.resolve([])
      : prisma.playerRoster.findMany({
          where: { leagueId: tournament.leagueId },
          orderBy: { name: "asc" },
        }),
  ]);

  const canAddTeam = tournament.teams.length < tournament.numTeams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">{tournament.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Roster: {tournament.roster?.name ?? "Not attached yet"} &middot; {tournament.teams.length}/
          {tournament.numTeams} teams &middot; squad size {tournament.squadSize} &middot;{" "}
          {formatCalendarDate(tournament.startDate)} – {formatCalendarDate(tournament.endDate)}
        </p>
        <EditTournamentDatesForm
          tournamentId={tournament.id}
          startDate={toDateInputValue(tournament.startDate)}
          endDate={toDateInputValue(tournament.endDate)}
        />
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <details className={card}>
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              {rulesDocument ? "Replace rules document" : "Upload rules document"}
            </summary>
            <div className="px-4 pb-4 flex flex-col gap-3">
              {rulesDocument && (
                <div className="text-sm flex items-center justify-between gap-3 flex-wrap">
                  <a
                    href={`/tournaments/${tournament.id}/rules`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {rulesDocument.fileName}
                  </a>
                  <DeleteRulesDocumentButton tournamentId={tournament.id} />
                </div>
              )}
              <UploadRulesDocumentForm tournamentId={tournament.id} />
            </div>
          </details>

          {canAddTeam ? (
            <details className={card}>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                Add team
              </summary>
              <AddTeamForm tournamentId={tournament.id} managers={managers} />
            </details>
          ) : (
            <div className={`${card} px-4 py-3 text-sm text-black/60 dark:text-white/60`}>
              Maximum number of teams reached.
            </div>
          )}

          <details className={card}>
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              Add sponsor
            </summary>
            <AddTournamentSponsorForm tournamentId={tournament.id} knownSponsors={knownSponsors} />
          </details>

          {!tournament.rosterId && (
            <details className={card}>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                Attach roster
              </summary>
              <AttachRosterForm tournamentId={tournament.id} rosters={leagueRosters} />
            </details>
          )}

          {tournament.rosterId ? (
            <Link
              href={`/admin/tournaments/${tournament.id}/auctions/new`}
              className={`${card} flex items-center px-4 py-3 text-sm font-medium hover:border-black/15 dark:hover:border-white/20 transition-colors`}
            >
              New auction
            </Link>
          ) : (
            <div className={`${card} flex items-center px-4 py-3 text-sm text-black/60 dark:text-white/60`}>
              Attach a roster before creating an auction.
            </div>
          )}
        </div>
      </section>

      <details className={card}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Sponsors ({sponsors.length})
        </summary>
        <div className="px-4 pb-4">
          {sponsors.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">No sponsors added yet.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sponsors.map((sponsor) => (
                <li
                  key={sponsor.id}
                  className={`${cardInteractive} relative flex flex-col items-center gap-2 p-3`}
                >
                  <div className="absolute top-2 right-2">
                    <DeleteTournamentSponsorButton sponsorId={sponsor.id} sponsorName={sponsor.name} />
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/tournament-sponsors/${sponsor.id}`}
                    alt={sponsor.name}
                    className="h-20 w-20 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-2"
                  />
                  {sponsor.websiteUrl ? (
                    <SponsorLink
                      sponsorId={sponsor.id}
                      websiteUrl={sponsor.websiteUrl}
                      className="text-sm font-medium underline underline-offset-2 text-center"
                    >
                      {sponsor.name}
                    </SponsorLink>
                  ) : (
                    <span className="text-sm font-medium text-center">{sponsor.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <section>
        <h2 className="text-lg font-medium mb-3">Teams</h2>
        {tournament.teams.length === 0 ? (
          <p className="text-black/60 dark:text-white/60 mb-4">No teams yet.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {tournament.teams.map((team) => (
              <li key={team.id} className={`${cardInteractive} relative flex flex-col items-center gap-2 p-4`}>
                <div className="absolute top-2 right-2">
                  <DeleteTeamButton
                    teamId={team.id}
                    teamName={team.name}
                    entryCount={team._count.entries}
                    compact
                  />
                </div>
                <Link
                  href={`/admin/tournaments/${tournament.id}/teams/${team.id}`}
                  className="flex flex-col items-center gap-2"
                >
                  {team.sponsorImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/teams/${team.id}/sponsor-image`}
                      alt={`${team.name} sponsor`}
                      className="h-20 w-20 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-2"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded border border-dashed border-black/10 dark:border-white/10 flex items-center justify-center text-xs text-black/30 dark:text-white/30">
                      No logo
                    </div>
                  )}
                  <span className="font-medium underline underline-offset-2 text-center">
                    {team.name}
                  </span>
                </Link>
                <span className="text-sm text-black/60 dark:text-white/60 text-center">
                  {team.manager ? team.manager.name : "No manager assigned"}
                  {team.managerOccupiesSlot ? " (occupies a slot)" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Auctions</h2>
        {auctions.length === 0 ? (
          <p className="text-black/60 dark:text-white/60">No auctions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {auctions.map((a) => (
              <li
                key={a.id}
                className={`${cardInteractive} flex items-center justify-between gap-4 px-4 py-3`}
              >
                <Link
                  href={`/admin/auctions/${a.id}`}
                  className="flex-1 flex items-center justify-between hover:underline"
                >
                  <span>{a.name}</span>
                  <span className="mr-4">
                    <Badge variant={AUCTION_STATUS_VARIANT[a.status] ?? "neutral"}>{a.status}</Badge>
                  </span>
                </Link>
                <DeleteAuctionButton auctionId={a.id} auctionName={a.name} status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
