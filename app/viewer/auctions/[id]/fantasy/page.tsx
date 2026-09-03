import { notFound } from "next/navigation";
import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import {
  getFantasyEligibility,
  listMyFantasyTeams,
  getFantasyStandings,
  getMostPickedPlayersByCategory,
  listFantasyPlayerPool,
  isFantasyEditingLocked,
  getMaxRosterSize,
} from "@/lib/services/fantasyTeam.service";
import { resolveFantasySort, sortFantasyStandings, resolveFantasyPage } from "@/lib/fantasyStandingsSort";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { FantasyTeamsManager } from "@/components/viewer/FantasyTeamsManager";
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
  const myTeams = await listMyFantasyTeams(id, session.user.id);
  const sponsors = await listTournamentSponsors(auction.tournament.id);

  // Once locked, everyone eligible sees the same read-only standings — the
  // admin overview, minus admin-only controls — rather than just their own
  // team(s); their own rows are highlighted within it instead of a separate
  // card.
  let standingsSection: React.ReactNode = null;
  if (locked) {
    const { hasPoints, standings: rankedStandings } = await getFantasyStandings(id);
    const { sort: rawSort, dir: rawDir, page: rawPage } = await searchParams;
    const { sortKey, sortDir } = resolveFantasySort(rawSort, rawDir);
    const page = resolveFantasyPage(rawPage);
    const standings = sortFantasyStandings(rankedStandings, sortKey, sortDir);
    // A user can have more than one team, so this is every one of their
    // rows, not just the first match.
    const myStandings = rankedStandings.filter((s) => s.team.userId === session.user.id);
    standingsSection =
      standings.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No fantasy teams were submitted.</p>
      ) : (
        <>
          {myStandings.length > 0 && (
            <div className="text-sm font-medium flex flex-col gap-0.5">
              {myStandings.map((s) => (
                <p key={s.team.id}>
                  {s.team.name || "Your team"} — current rank: #{s.rank} of {standings.length}
                </p>
              ))}
            </div>
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

      {locked && myTeams.length === 0 && (
        <p className="text-black/60 dark:text-white/60">
          You didn&apos;t save a fantasy team in time.
        </p>
      )}

      {locked ? (
        standingsSection
      ) : (
        <FantasyTeamsManager
          auctionId={auction.id}
          cap={await getMaxRosterSize(auction.id)}
          budget={String(auction.teamBudget)}
          players={await listFantasyPlayerPool(
            auction.id,
            auction.fantasyPricingModel,
            eligibility.selfAuctionPlayerId
          )}
          lockedPlayerId={eligibility.selfAuctionPlayerId}
          selfPickRequired={auction.fantasySelfPickRequired}
          maxTeams={auction.fantasyMaxTeamsPerUser}
          initialTeams={myTeams.map((t) => ({
            id: t.id,
            name: t.name,
            picks: t.picks.map((p) => p.auctionPlayerId),
          }))}
        />
      )}

      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
