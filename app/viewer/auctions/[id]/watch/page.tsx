import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { scopeLeagueId } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { getRulesDocumentIfViewable } from "@/lib/services/tournamentDocument.service";
import { LiveAuctionView } from "@/components/auction/LiveAuctionView";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const auction = await loadScopedAuction(id, scopeLeagueId(session!));
  const state = await getAuctionState(id);
  if (!state) notFound();

  const rulesDocument = await getRulesDocumentIfViewable(auction.tournamentId, session!.user);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{state.name}</h1>
      <div className="mb-6">
        <p className="text-sm text-black/60 dark:text-white/60">{state.tournamentName}</p>
        {rulesDocument && (
          <a
            href={`/tournaments/${auction.tournamentId}/rules`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-2"
          >
            View tournament rules
          </a>
        )}
      </div>
      <LiveAuctionView initialState={state} />
    </div>
  );
}
