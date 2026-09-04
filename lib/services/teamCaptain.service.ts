import { prisma } from "@/lib/prisma";
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";
import { assertAuctionLeagueNotReadOnly } from "@/lib/services/league.service";
import { writeAuditLog } from "@/lib/services/auditLog.service";

function assertCompleted(auction: { status: string }) {
  if (auction.status !== "COMPLETED") {
    throw new InvalidStateTransitionError(
      "Captains can only be assigned once the auction has concluded"
    );
  }
}

/**
 * Assigns, changes, or clears (auctionPlayerId: null) a team's captain for
 * one auction — not a one-shot action, freely repeatable at any time once
 * the auction is COMPLETED. The chosen player must be one this entry
 * actually won (soldToEntryId === entryId); no vice-captain concept.
 */
export async function assignTeamCaptain(
  auctionId: string,
  teamAuctionEntryId: string,
  auctionPlayerId: string | null,
  actorUserId: string
): Promise<void> {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  assertCompleted(auction);

  const entry = await prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } });
  if (!entry || entry.auctionId !== auctionId) {
    throw new ValidationError("Team entry not found in this auction");
  }

  let newCaptainName: string | null = null;
  if (auctionPlayerId != null) {
    const auctionPlayer = await prisma.auctionPlayer.findUnique({
      where: { id: auctionPlayerId },
      include: { player: true },
    });
    if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
      throw new ValidationError("Player not found in this auction");
    }
    if (auctionPlayer.soldToEntryId !== entry.id) {
      throw new ValidationError("This player was not won by this team in this auction");
    }
    newCaptainName = auctionPlayer.player.name;
  }

  const previousCaptain = entry.captainAuctionPlayerId
    ? await prisma.auctionPlayer.findUnique({
        where: { id: entry.captainAuctionPlayerId },
        include: { player: true },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.teamAuctionEntry.update({
      where: { id: teamAuctionEntryId },
      data: { captainAuctionPlayerId: auctionPlayerId },
    });
    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: teamAuctionEntryId,
      auctionId,
      action: auctionPlayerId != null ? "TEAM_CAPTAIN_ASSIGNED" : "TEAM_CAPTAIN_CLEARED",
      actorUserId,
      before: { captainName: previousCaptain?.player.name ?? null },
      after: { captainName: newCaptainName },
    });
  });
}
