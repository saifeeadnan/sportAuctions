import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { allLeagueIds } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { getAuctionState, findSoldTeamEntryIdForLoginId } from "@/lib/services/auctionState.service";
import { getRulesDocumentIfViewable } from "@/lib/services/tournamentDocument.service";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { LiveAuctionView } from "@/components/auction/LiveAuctionView";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";
import { SponsorSplash } from "@/components/tournament/SponsorSplash";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const auction = await loadScopedAuction(id, allLeagueIds(session!));
  const state = await getAuctionState(id);
  if (!state) notFound();

  const rulesDocument = await getRulesDocumentIfViewable(auction.tournamentId, session!.user);
  const sponsors = await listTournamentSponsors(auction.tournamentId);

  // If this viewer is themselves a player who was sold to a team in this
  // auction, highlight that team the same way a manager's live view does —
  // this is what surfaces the team's sponsor image to "any player belonging
  // to the team", not just its manager.
  const account = await prisma.user.findUnique({ where: { id: session!.user.id } });
  const myTeamEntryId = account?.loginId
    ? await findSoldTeamEntryIdForLoginId(id, account.loginId)
    : null;

  return (
    <div>
      <SponsorSplash
        tournamentId={auction.tournamentId}
        tournamentName={state.tournamentName}
        sponsors={sponsors}
      />
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
      <LiveAuctionView initialState={state} highlightTeamEntryId={myTeamEntryId ?? undefined} />
      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
