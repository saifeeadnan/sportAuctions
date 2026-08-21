import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { allLeagueIds } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { BroadcastAuctionView } from "@/components/auction/BroadcastAuctionView";

/** The OBS-friendly broadcast canvas — same auth/data shape as the sibling
 * console page, minus the read-only-league lookup (this view takes no
 * actions, so read-only status is irrelevant). */
export default async function BroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const auction = await loadScopedAuction(id, allLeagueIds(session!));
  const state = await getAuctionState(id);
  if (!state) notFound();

  const sponsors = await listTournamentSponsors(auction.tournamentId);

  return <BroadcastAuctionView initialState={state} sponsors={sponsors} />;
}
