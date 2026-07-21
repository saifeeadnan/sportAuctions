import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DraftForm } from "@/components/manager/DraftForm";
import { TeamStrengthSummary } from "@/components/manager/TeamStrengthSummary";
import { findManagerSelfAuctionPlayerId } from "@/lib/services/preAuctionDraft.service";
import { RosterRibbon } from "@/components/roster/RosterRibbon";
import type { RatedPlayer } from "@/lib/teamStrength";

function toRatedPlayer(player: {
  position: string | null;
  rating: unknown;
  battingRating: unknown;
  bowlingRating: unknown;
  fieldingRating: unknown;
}): RatedPlayer {
  return {
    position: player.position,
    rating: player.rating != null ? String(player.rating) : null,
    battingRating: player.battingRating != null ? String(player.battingRating) : null,
    bowlingRating: player.bowlingRating != null ? String(player.bowlingRating) : null,
    fieldingRating: player.fieldingRating != null ? String(player.fieldingRating) : null,
  };
}

export default async function DraftPage({
  params,
}: {
  params: Promise<{ teamAuctionEntryId: string }>;
}) {
  const { teamAuctionEntryId } = await params;
  const session = await auth();

  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    include: {
      team: true,
      auction: true,
      draftSubmissions: true,
    },
  });

  if (!entry || entry.team.managerId !== session!.user.id) notFound();

  const [availablePlayersRaw, lockedPlayerId, confirmedPlayers] = await Promise.all([
    prisma.auctionPlayer.findMany({
      where: { auctionId: entry.auctionId, status: "AVAILABLE" },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    }),
    entry.team.managerId
      ? findManagerSelfAuctionPlayerId(entry.auctionId, entry.team.managerId)
      : Promise.resolve(null),
    prisma.auctionPlayer.findMany({
      where: { soldToEntryId: teamAuctionEntryId },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    }),
  ]);

  // Categories can be marked live-bidding-only — exclude those from the draft
  // pool, except the manager's own guaranteed self-pick, which is never gated.
  const availablePlayers = availablePlayersRaw.filter(
    (ap) => ap.category.preAuctionEligible || ap.id === lockedPlayerId
  );

  const editable = entry.status === "PRE_AUCTION_DRAFTING" || entry.status === "PRE_AUCTION_SUBMITTED";
  const allocated = entry.status === "ALLOCATED_PRE_AUCTION";
  const cap = entry.slotsTotal - entry.slotsFilled;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">
          {entry.team.name} &middot; {entry.auction.name}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Status: {entry.status} &middot; pick up to {cap} player(s) &middot; budget available:{" "}
          {String(entry.budgetRemaining)}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">
          Your confirmed roster so far ({confirmedPlayers.length})
        </h2>
        <RosterRibbon
          players={confirmedPlayers.map((ap) => ({
            id: ap.id,
            playerName: ap.player.name,
            photoUrl: ap.player.photoUrl,
            position: ap.player.position,
            soldPrice: ap.soldPrice != null ? String(ap.soldPrice) : null,
          }))}
        />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">{allocated ? "Draft results" : "Draft picks"}</h2>
        {editable ? (
          <DraftForm
            entryId={entry.id}
            cap={cap}
            budgetRemaining={String(entry.budgetRemaining)}
            confirmedPlayers={confirmedPlayers.map((ap) => toRatedPlayer(ap.player))}
            players={availablePlayers.map((ap) => ({
              id: ap.id,
              name: ap.player.name,
              categoryName: ap.category.name,
              basePrice: String(ap.category.basePrice),
              ...toRatedPlayer(ap.player),
            }))}
            initialSelected={entry.draftSubmissions.map((s) => s.auctionPlayerId)}
            lockedPlayerId={lockedPlayerId ?? undefined}
          />
        ) : allocated ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-black/60 dark:text-white/60">
              The pre-auction draft has been resolved — uniquely-picked players are confirmed to
              your roster above, and any contested picks moved to the live auction pool.
            </p>
            <TeamStrengthSummary players={confirmedPlayers.map((ap) => toRatedPlayer(ap.player))} />
          </div>
        ) : (
          <p className="text-black/60 dark:text-white/60">
            The draft window for this auction is closed.
          </p>
        )}
      </section>
    </div>
  );
}
