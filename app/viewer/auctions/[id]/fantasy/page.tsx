import { notFound } from "next/navigation";
import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import {
  getFantasyEligibility,
  getFantasyTeam,
  getFantasyStandings,
  getMostPickedPlayersByCategory,
  listFantasyPlayerPool,
  isFantasyEditingLocked,
  getMaxRosterSize,
} from "@/lib/services/fantasyTeam.service";
import { resolveFantasySort, sortFantasyStandings, resolveFantasyPage } from "@/lib/fantasyStandingsSort";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { FantasyTeamForm } from "@/components/viewer/FantasyTeamForm";
import { FantasyStandingsList } from "@/components/fantasy/FantasyStandingsList";
import { MostPickedPlayersTable } from "@/components/fantasy/MostPickedPlayersTable";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";
import { SponsorSplash } from "@/components/tournament/SponsorSplash";
import { formatCalendarDate } from "@/lib/dates";

export default async function FantasyTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; dir?: string; page?: string }>;
}) {
  const { id } = await params;
  const session = await requireRole("VIEWER", "TEAM_MANAGER");

  const eligibility = await getFantasyEligibility(id, session.user.id, allLeagueIds(session));
  if (!eligibility.eligible) {
    if (eligibility.reason === "Auction not found") notFound();
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-black/60 dark:text-white/60">{eligibility.reason}</p>
      </div>
    );
  }

  const { auction } = eligibility;
  const locked = isFantasyEditingLocked(auction);
  const effectiveLockDate = auction.fantasyLockDate ?? auction.tournament.startDate;
  const existingTeam = await getFantasyTeam(id, session.user.id);
  const sponsors = await listTournamentSponsors(auction.tournament.id);

  // Once locked, everyone eligible sees the same read-only standings — the
  // admin overview, minus admin-only controls — rather than just their own
  // team; their own row is highlighted within it instead of a separate card.
  let standingsSection: React.ReactNode = null;
  if (locked) {
    const { hasPoints, standings: rankedStandings } = await getFantasyStandings(id);
    const { sort: rawSort, dir: rawDir, page: rawPage } = await searchParams;
    const { sortKey, sortDir } = resolveFantasySort(rawSort, rawDir);
    const page = resolveFantasyPage(rawPage);
    const standings = sortFantasyStandings(rankedStandings, sortKey, sortDir);
    const myStanding = rankedStandings.find((s) => s.team.userId === session.user.id);
    standingsSection =
      standings.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No fantasy teams were submitted.</p>
      ) : (
        <>
          {myStanding && (
            <p className="text-sm font-medium">
              Current rank: #{myStanding.rank} of {standings.length}
            </p>
          )}
          <FantasyStandingsList
            auctionId={auction.id}
            standings={standings}
            hasPoints={hasPoints}
            sortKey={sortKey}
            sortDir={sortDir}
            page={page}
            highlightUserId={session.user.id}
          />
          <MostPickedPlayersTable categories={await getMostPickedPlayersByCategory(auction.id)} />
        </>
      );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
      <SponsorSplash
        tournamentId={auction.tournament.id}
        tournamentName={auction.tournament.name}
        sponsors={sponsors}
      />
      <p className="text-sm text-black/60 dark:text-white/60">
        {auction.tournament.league.name} / {auction.tournament.name} / {auction.name}
        {!locked && (
          <>
            {" "}
            &middot; Editable until{" "}
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {formatCalendarDate(effectiveLockDate)}
            </span>
            .
          </>
        )}
        {locked && <> &middot; budget: {String(auction.teamBudget)}</>}
      </p>

      {locked && !existingTeam && (
        <p className="text-black/60 dark:text-white/60">
          You didn&apos;t save a fantasy team in time.
        </p>
      )}

      {locked ? (
        standingsSection
      ) : (
        <FantasyTeamForm
          auctionId={auction.id}
          cap={await getMaxRosterSize(auction.id)}
          budget={String(auction.teamBudget)}
          players={await listFantasyPlayerPool(auction.id)}
          lockedPlayerId={eligibility.selfAuctionPlayerId}
          initialSelected={existingTeam?.picks.map((p) => p.auctionPlayerId) ?? []}
          initialName={existingTeam?.name ?? undefined}
        />
      )}

      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
