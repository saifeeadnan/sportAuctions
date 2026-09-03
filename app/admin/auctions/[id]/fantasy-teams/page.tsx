import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { getFantasyStandings, getMostPickedPlayersByCategory } from "@/lib/services/fantasyTeam.service";
import { resolveFantasySort, sortFantasyStandings, resolveFantasyPage } from "@/lib/fantasyStandingsSort";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { FantasyStandingsList } from "@/components/fantasy/FantasyStandingsList";
import { MostPickedPlayersTable } from "@/components/fantasy/MostPickedPlayersTable";
import { UploadPointsForm } from "@/components/admin/UploadPointsForm";
import { EditFantasyLockDateForm } from "@/components/admin/EditFantasyLockDateForm";
import { EditFantasySettingsForm } from "@/components/admin/EditFantasySettingsForm";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";
import { formatCalendarDate, toDateInputValue } from "@/lib/dates";
import { card } from "@/lib/ui";

export default async function FantasyTeamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; dir?: string; page?: string }>;
}) {
  const { id } = await params;
  const { leagueIds } = await requireAdminOrLeagueAdmin();

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: { tournament: true },
  });
  if (!auction) notFound();
  assertInScope(leagueIds, auction.tournament.leagueId);

  const { hasPoints, standings: rankedStandings } = await getFantasyStandings(id);

  const { sort: rawSort, dir: rawDir, page: rawPage } = await searchParams;
  const { sortKey, sortDir } = resolveFantasySort(rawSort, rawDir);
  const page = resolveFantasyPage(rawPage);
  const standings = sortFantasyStandings(rankedStandings, sortKey, sortDir);
  const sponsors = await listTournamentSponsors(auction.tournament.id);
  const effectiveLockDate = auction.fantasyLockDate ?? auction.tournament.startDate;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
      <p className="text-sm text-black/60 dark:text-white/60">
        {auction.tournament.name} / {auction.name} / Fantasy teams &middot; {standings.length} submitted
      </p>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-black/60 dark:text-white/60">
          Picks lock{" "}
          <span className="font-bold text-amber-600 dark:text-amber-400">
            {formatCalendarDate(effectiveLockDate)}
          </span>
          {auction.fantasyLockDate == null && " (tournament start date)"}
        </span>
        <EditFantasyLockDateForm
          auctionId={auction.id}
          effectiveLockDate={toDateInputValue(effectiveLockDate)}
        />
      </div>

      <EditFantasySettingsForm
        auctionId={auction.id}
        pricingModel={auction.fantasyPricingModel}
        selfPickRequired={auction.fantasySelfPickRequired}
        maxTeamsPerUser={auction.fantasyMaxTeamsPerUser}
      />

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
        <>
          <FantasyStandingsList
            auctionId={auction.id}
            standings={standings}
            hasPoints={hasPoints}
            sortKey={sortKey}
            sortDir={sortDir}
            page={page}
            showDeleteButton
          />
          <MostPickedPlayersTable categories={await getMostPickedPlayersByCategory(auction.id)} />
        </>
      )}

      <Link href={`/admin/auctions/${auction.id}`} className="text-sm underline underline-offset-2">
        Back to auction
      </Link>

      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
