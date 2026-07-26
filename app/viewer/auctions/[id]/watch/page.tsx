import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { scopeLeagueId } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { LiveAuctionView } from "@/components/auction/LiveAuctionView";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  await loadScopedAuction(id, scopeLeagueId(session!));
  const state = await getAuctionState(id);
  if (!state) notFound();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{state.name}</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">{state.tournamentName}</p>
      <LiveAuctionView initialState={state} />
    </div>
  );
}
