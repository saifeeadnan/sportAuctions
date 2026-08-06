import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { scopeLeagueId } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
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

  const sponsors = await listTournamentSponsors(auction.tournamentId);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-3">
        {state.name} <span className="text-black/50 dark:text-white/50 font-normal">&middot; {state.tournamentName}</span>
      </h1>
      <AuctioneerConsole initialState={state} />
      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
