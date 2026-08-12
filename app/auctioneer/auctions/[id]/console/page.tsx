import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scopeLeagueId } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { isLeagueReadOnly } from "@/lib/services/league.service";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { AuctioneerConsole } from "@/components/auctioneer/AuctioneerConsole";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";

export default async function ConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const auction = await loadScopedAuction(id, scopeLeagueId(session!));
  const state = await getAuctionState(id);
  if (!state) notFound();

  const [sponsors, league] = await Promise.all([
    listTournamentSponsors(auction.tournamentId),
    prisma.league.findUniqueOrThrow({
      where: { id: auction.tournament.leagueId },
      select: { endDate: true },
    }),
  ]);
  const readOnly = isLeagueReadOnly(league);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-3">
        {state.name} <span className="text-black/50 dark:text-white/50 font-normal">&middot; {state.tournamentName}</span>
      </h1>
      {readOnly && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
          This league is read-only — no auction actions can be taken. Existing state can still be
          viewed.
        </p>
      )}
      <AuctioneerConsole initialState={state} readOnly={readOnly} />
      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
