import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { LiveAuctionView } from "@/components/auction/LiveAuctionView";

export default async function ManagerLivePage({
  params,
}: {
  params: Promise<{ teamAuctionEntryId: string }>;
}) {
  const { teamAuctionEntryId } = await params;
  const session = await auth();

  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    include: { team: true },
  });
  if (!entry || entry.team.managerId !== session!.user.id) notFound();

  const state = await getAuctionState(entry.auctionId);
  if (!state) notFound();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{state.name}</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">{state.tournamentName}</p>
      <LiveAuctionView initialState={state} highlightTeamEntryId={entry.id} />
    </div>
  );
}
