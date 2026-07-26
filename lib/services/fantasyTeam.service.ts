import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import {
  ValidationError,
  InsufficientBudgetError,
  SquadCapExceededError,
  InvalidStateTransitionError,
} from "@/lib/errors";

/** The price a fantasy pick costs: what it actually sold for, or its category
 * base price if it went unsold — the real auction's outcome either way. */
function fantasyPrice(auctionPlayer: {
  status: string;
  soldPrice: Prisma.Decimal | null;
  category: { basePrice: Prisma.Decimal };
}): Prisma.Decimal {
  if (auctionPlayer.status === "SOLD" && auctionPlayer.soldPrice != null) {
    return auctionPlayer.soldPrice;
  }
  return auctionPlayer.category.basePrice;
}

/** The viewer's own auction-player entry for this specific auction, if they
 * were part of its pool — this is what guarantees them a spot on their own
 * fantasy team, the same way a manager's own pick is auto-included in the
 * real pre-auction draft. */
async function findSelfAuctionPlayer(auctionId: string, rosterId: string, loginId: string) {
  return prisma.auctionPlayer.findFirst({
    where: {
      auctionId,
      player: { rosterId, loginId: { equals: loginId, mode: "insensitive" } },
    },
  });
}

/** Completed auctions this viewer was actually part of (i.e. eligible for a fantasy team). */
export async function listEligibleCompletedAuctionsForViewer(userId: string, leagueId: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.loginId) return [];

  return prisma.auction.findMany({
    where: {
      status: "COMPLETED",
      tournament: leagueId ? { leagueId } : undefined,
      auctionPlayers: {
        some: { player: { loginId: { equals: user.loginId, mode: "insensitive" } } },
      },
    },
    include: { tournament: true },
    orderBy: { completedAt: "desc" },
  });
}

export async function getFantasyEligibility(auctionId: string, userId: string, leagueId: string | null) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: true },
  });
  if (!auction) return { eligible: false as const, reason: "Auction not found" };
  if (leagueId !== null && auction.tournament.leagueId !== leagueId) {
    return { eligible: false as const, reason: "Auction not found" };
  }
  if (auction.status !== "COMPLETED") {
    return { eligible: false as const, reason: "This auction hasn't completed yet" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.loginId) return { eligible: false as const, reason: "Your account has no login ID" };

  const selfAuctionPlayer = await findSelfAuctionPlayer(
    auctionId,
    auction.tournament.rosterId,
    user.loginId
  );
  if (!selfAuctionPlayer) {
    return {
      eligible: false as const,
      reason: "You weren't part of this auction's player pool, so you can't build a fantasy team for it",
    };
  }

  return { eligible: true as const, auction, selfAuctionPlayerId: selfAuctionPlayer.id };
}

/** All fantasy teams submitted for an auction, for the admin overview. */
export async function listFantasyTeamsForAuction(auctionId: string) {
  return prisma.fantasyTeam.findMany({
    where: { auctionId },
    include: {
      user: true,
      picks: { include: { auctionPlayer: { include: { player: true, category: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteFantasyTeam(fantasyTeamId: string) {
  const { count } = await prisma.fantasyTeam.deleteMany({ where: { id: fantasyTeamId } });
  if (count === 0) {
    throw new ValidationError("Fantasy team not found");
  }
}

export async function getFantasyTeam(auctionId: string, userId: string) {
  return prisma.fantasyTeam.findUnique({
    where: { auctionId_userId: { auctionId, userId } },
    include: {
      picks: { include: { auctionPlayer: { include: { player: true, category: true } } } },
    },
  });
}

/** All auction players available for fantasy picking, priced as they'd cost. */
export async function listFantasyPlayerPool(auctionId: string) {
  const auctionPlayers = await prisma.auctionPlayer.findMany({
    where: { auctionId },
    include: { player: true, category: true },
    orderBy: { player: { name: "asc" } },
  });
  return auctionPlayers.map((ap) => ({
    id: ap.id,
    name: ap.player.name,
    position: ap.player.position,
    photoUrl: ap.player.photoUrl,
    categoryName: ap.category.name,
    status: ap.status,
    price: fantasyPrice(ap).toString(),
    rating: ap.player.rating != null ? String(ap.player.rating) : null,
    battingRating: ap.player.battingRating != null ? String(ap.player.battingRating) : null,
    bowlingRating: ap.player.bowlingRating != null ? String(ap.player.bowlingRating) : null,
    fieldingRating: ap.player.fieldingRating != null ? String(ap.player.fieldingRating) : null,
  }));
}

export async function submitFantasyTeam(
  auctionId: string,
  userId: string,
  auctionPlayerIds: string[],
  leagueId: string | null
) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: true },
  });
  if (!auction) throw new ValidationError("Auction not found");
  if (leagueId !== null && auction.tournament.leagueId !== leagueId) {
    throw new ValidationError("Auction not found");
  }
  if (auction.status !== "COMPLETED") {
    throw new InvalidStateTransitionError(
      "Fantasy teams can only be built once the auction is completed"
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.loginId) throw new ValidationError("Your account has no login ID");

  const selfAuctionPlayer = await findSelfAuctionPlayer(
    auctionId,
    auction.tournament.rosterId,
    user.loginId
  );
  if (!selfAuctionPlayer) {
    throw new ValidationError("You weren't part of this auction's player pool");
  }

  const existing = await prisma.fantasyTeam.findUnique({
    where: { auctionId_userId: { auctionId, userId } },
  });
  if (existing) {
    throw new InvalidStateTransitionError(
      "You've already submitted a fantasy team for this auction — it can't be changed"
    );
  }

  // You're always on your own fantasy team, whether or not the client sent your
  // own pick — this only ever fills one of the total squad slots, same as a
  // manager's own guaranteed pick in the real pre-auction draft.
  const uniqueIds = new Set(auctionPlayerIds);
  uniqueIds.add(selfAuctionPlayer.id);

  const idsArray = Array.from(uniqueIds);
  if (idsArray.length > auction.tournament.squadSize) {
    throw new SquadCapExceededError(
      `A fantasy team cannot exceed ${auction.tournament.squadSize} player(s)`
    );
  }

  const players = await prisma.auctionPlayer.findMany({
    where: { id: { in: idsArray }, auctionId },
    include: { category: true },
  });
  if (players.length !== idsArray.length) {
    throw new ValidationError("One or more selected players are not part of this auction");
  }

  const totalPrice = players.reduce(
    (sum, ap) => sum.plus(fantasyPrice(ap)),
    new Prisma.Decimal(0)
  );
  if (totalPrice.greaterThan(auction.teamBudget)) {
    throw new InsufficientBudgetError(
      `Total price of selected players (${totalPrice.toString()}) exceeds the budget (${auction.teamBudget.toString()})`
    );
  }

  return prisma.fantasyTeam.create({
    data: {
      auctionId,
      userId,
      picks: {
        create: players.map((ap) => ({
          auctionPlayerId: ap.id,
          price: fantasyPrice(ap),
        })),
      },
    },
    include: {
      picks: { include: { auctionPlayer: { include: { player: true, category: true } } } },
    },
  });
}
