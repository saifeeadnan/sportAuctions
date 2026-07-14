import { prisma } from "@/lib/prisma";

export type AuctionStatePlayer = {
  id: string;
  name: string;
  position: string | null;
  categoryName: string;
  basePrice: string;
  status: string;
  soldPrice: string | null;
  soldToTeamName: string | null;
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
      categoryName: ap.category.name,
      basePrice: String(ap.category.basePrice),
      status: ap.status,
      soldPrice: ap.soldPrice != null ? String(ap.soldPrice) : null,
      soldToTeamName: ap.soldToEntry?.team.name ?? null,
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
