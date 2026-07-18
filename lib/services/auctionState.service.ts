import { prisma } from "@/lib/prisma";

export type AuctionStatePlayer = {
  id: string;
  name: string;
  position: string | null;
  photoUrl: string | null;
  previousTeam: string | null;
  categoryName: string;
  basePrice: string;
  status: string;
  soldPrice: string | null;
  soldToEntryId: string | null;
  soldToTeamName: string | null;
  soldVia: string | null;
  soldAt: string | null;
  rating: string | null;
  battingRating: string | null;
  bowlingRating: string | null;
  fieldingRating: string | null;
};

export type AuctionStateTeam = {
  id: string;
  teamName: string;
  status: string;
  budgetRemaining: string;
  slotsFilled: number;
  slotsTotal: number;
};

export type AuctionState = {
  id: string;
  name: string;
  status: string;
  tournamentName: string;
  players: AuctionStatePlayer[];
  teams: AuctionStateTeam[];
};

export async function getAuctionState(auctionId: string): Promise<AuctionState | null> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      tournament: true,
      auctionPlayers: {
        include: { player: true, category: true, soldToEntry: { include: { team: true } } },
        orderBy: { player: { name: "asc" } },
      },
      entries: { include: { team: true }, orderBy: { team: { name: "asc" } } },
    },
  });
  if (!auction) return null;

  return {
    id: auction.id,
    name: auction.name,
    status: auction.status,
    tournamentName: auction.tournament.name,
    players: auction.auctionPlayers.map((ap) => ({
      id: ap.id,
      name: ap.player.name,
      position: ap.player.position,
      photoUrl: ap.player.photoUrl,
      previousTeam: ap.player.previousTeam,
      categoryName: ap.category.name,
      basePrice: String(ap.category.basePrice),
      status: ap.status,
      soldPrice: ap.soldPrice != null ? String(ap.soldPrice) : null,
      soldToEntryId: ap.soldToEntryId,
      soldToTeamName: ap.soldToEntry?.team.name ?? null,
      soldVia: ap.soldVia,
      soldAt: ap.soldAt != null ? ap.soldAt.toISOString() : null,
      rating: ap.player.rating != null ? String(ap.player.rating) : null,
      battingRating: ap.player.battingRating != null ? String(ap.player.battingRating) : null,
      bowlingRating: ap.player.bowlingRating != null ? String(ap.player.bowlingRating) : null,
      fieldingRating: ap.player.fieldingRating != null ? String(ap.player.fieldingRating) : null,
    })),
    teams: auction.entries.map((e) => ({
      id: e.id,
      teamName: e.team.name,
      status: e.status,
      budgetRemaining: String(e.budgetRemaining),
      slotsFilled: e.slotsFilled,
      slotsTotal: e.slotsTotal,
    })),
  };
}
