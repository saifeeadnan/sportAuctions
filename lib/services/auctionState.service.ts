import { prisma } from "@/lib/prisma";
import type { OnClockTemplate, OnClockFieldKey } from "@/lib/onClockDisplay";

export type AuctionStatePlayer = {
  id: string;
  name: string;
  position: string | null;
  age: number | null;
  photoUrl: string | null;
  previousTeam: string | null;
  categoryName: string;
  basePrice: string;
  bidIncrement: string | null;
  status: string;
  soldPrice: string | null;
  soldToEntryId: string | null;
  soldToTeamName: string | null;
  soldVia: string | null;
  soldAt: string | null;
  currentBid: string | null;
  currentBidderEntryId: string | null;
  currentBidderTeamName: string | null;
  bidCount: number;
  bidCooldownUntil: string | null;
  rating: string | null;
  battingRating: string | null;
  bowlingRating: string | null;
  fieldingRating: string | null;
};

export type AuctionStateTeam = {
  id: string;
  teamId: string;
  teamName: string;
  status: string;
  budgetRemaining: string;
  slotsFilled: number;
  slotsTotal: number;
  hasSponsorImage: boolean;
};

export type AuctionState = {
  id: string;
  name: string;
  status: string;
  tournamentName: string;
  onClockTemplate: OnClockTemplate;
  onClockVisibleFields: OnClockFieldKey[];
  players: AuctionStatePlayer[];
  teams: AuctionStateTeam[];
};

export async function getAuctionState(auctionId: string): Promise<AuctionState | null> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      tournament: true,
      auctionPlayers: {
        include: {
          player: true,
          category: true,
          soldToEntry: { include: { team: true } },
          currentBidderEntry: { include: { team: true } },
          _count: { select: { bids: true } },
        },
        orderBy: { player: { name: "asc" } },
      },
      entries: {
        include: { team: { include: { sponsorImage: { select: { id: true } } } } },
        orderBy: { team: { name: "asc" } },
      },
    },
  });
  if (!auction) return null;

  return {
    id: auction.id,
    name: auction.name,
    status: auction.status,
    tournamentName: auction.tournament.name,
    onClockTemplate: auction.onClockTemplate,
    onClockVisibleFields: auction.onClockVisibleFields as OnClockFieldKey[],
    players: auction.auctionPlayers.map((ap) => ({
      id: ap.id,
      name: ap.player.name,
      position: ap.player.position,
      age: ap.player.age,
      photoUrl: ap.player.photoUrl,
      previousTeam: ap.player.previousTeam,
      categoryName: ap.category.name,
      basePrice: String(ap.category.basePrice),
      bidIncrement: ap.category.bidIncrement != null ? String(ap.category.bidIncrement) : null,
      status: ap.status,
      soldPrice: ap.soldPrice != null ? String(ap.soldPrice) : null,
      soldToEntryId: ap.soldToEntryId,
      soldToTeamName: ap.soldToEntry?.team.name ?? null,
      soldVia: ap.soldVia,
      soldAt: ap.soldAt != null ? ap.soldAt.toISOString() : null,
      currentBid: ap.currentBidAmount != null ? String(ap.currentBidAmount) : null,
      currentBidderEntryId: ap.currentBidderEntryId,
      currentBidderTeamName: ap.currentBidderEntry?.team.name ?? null,
      bidCount: ap._count.bids,
      bidCooldownUntil: ap.bidCooldownUntil != null ? ap.bidCooldownUntil.toISOString() : null,
      rating: ap.player.rating != null ? String(ap.player.rating) : null,
      battingRating: ap.player.battingRating != null ? String(ap.player.battingRating) : null,
      bowlingRating: ap.player.bowlingRating != null ? String(ap.player.bowlingRating) : null,
      fieldingRating: ap.player.fieldingRating != null ? String(ap.player.fieldingRating) : null,
    })),
    teams: auction.entries.map((e) => ({
      id: e.id,
      teamId: e.teamId,
      teamName: e.team.name,
      status: e.status,
      budgetRemaining: String(e.budgetRemaining),
      slotsFilled: e.slotsFilled,
      slotsTotal: e.slotsTotal,
      hasSponsorImage: !!e.team.sponsorImage,
    })),
  };
}

/** The team-auction-entry a player (matched by login ID) was sold to in this
 * auction, if any — lets a player's own watch view highlight "their" team the
 * same way a manager's live view already does. */
export async function findSoldTeamEntryIdForLoginId(
  auctionId: string,
  loginId: string
): Promise<string | null> {
  const soldAuctionPlayer = await prisma.auctionPlayer.findFirst({
    where: {
      auctionId,
      status: "SOLD",
      soldToEntryId: { not: null },
      player: { loginId: { equals: loginId, mode: "insensitive" } },
    },
    select: { soldToEntryId: true },
  });
  return soldAuctionPlayer?.soldToEntryId ?? null;
}
