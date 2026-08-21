import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";
import { computePlayerValueScores } from "@/lib/auction-analytics/playerValue";
import type { AnalyticsPlayer } from "@/lib/auction-analytics/types";

/** Idempotent — a previously-created link never silently breaks. Not gated
 * on league read-only status: whether a league is still active has nothing
 * to do with whether an admin can create a recap link for one of its past
 * auctions (submitFantasyTeam is existing precedent for a completed-auction
 * action that doesn't call assertAuctionLeagueNotReadOnly either). */
export async function getOrCreateHighlightsToken(auctionId: string): Promise<string> {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status !== "COMPLETED") {
    throw new InvalidStateTransitionError(
      "A shareable link can only be created once the auction has concluded"
    );
  }
  if (auction.highlightsToken) return auction.highlightsToken;

  const token = randomBytes(24).toString("base64url");
  const updated = await prisma.auction.update({
    where: { id: auctionId },
    data: { highlightsToken: token },
  });
  return updated.highlightsToken!;
}

export type AuctionHighlightsData = {
  auctionName: string;
  tournamentName: string;
  tournamentId: string;
  completedAt: Date;
  soldCount: number;
  unsoldCount: number;
  biggestBuyByCategory: {
    categoryName: string;
    playerName: string;
    teamName: string;
    price: string;
    bidCount: number;
  }[];
  bestValuePick: { playerName: string; categoryName: string; teamName: string; price: string } | null;
  spendByCategory: { categoryName: string; totalSpent: string; playersSold: number }[];
};

/**
 * The public read path — looked up by unguessable token alone. This is the
 * one intentionally-unauthenticated data path in the app; do not add a
 * session/role guard here or in its caller.
 */
export async function getAuctionHighlights(token: string): Promise<AuctionHighlightsData | null> {
  const auction = await prisma.auction.findUnique({
    where: { highlightsToken: token },
    select: {
      name: true,
      status: true,
      completedAt: true,
      tournament: { select: { id: true, name: true } },
      auctionPlayers: {
        select: {
          id: true,
          status: true,
          soldPrice: true,
          categoryId: true,
          category: { select: { name: true } },
          player: {
            select: {
              name: true,
              position: true,
              rating: true,
              battingRating: true,
              bowlingRating: true,
              fieldingRating: true,
            },
          },
          soldToEntry: { select: { team: { select: { name: true } } } },
          _count: { select: { bids: true } },
        },
      },
    },
  });
  if (!auction || auction.status !== "COMPLETED") return null;

  const sold = auction.auctionPlayers.filter(
    (ap) => ap.status === "SOLD" && ap.soldPrice != null && ap.soldToEntry != null
  ) as Array<
    (typeof auction.auctionPlayers)[number] & {
      soldPrice: NonNullable<(typeof auction.auctionPlayers)[number]["soldPrice"]>;
      soldToEntry: NonNullable<(typeof auction.auctionPlayers)[number]["soldToEntry"]>;
    }
  >;

  const biggestBuyRowByCategory = new Map<string, (typeof sold)[number]>();
  for (const ap of sold) {
    const current = biggestBuyRowByCategory.get(ap.categoryId);
    if (!current || ap.soldPrice.greaterThan(current.soldPrice)) {
      biggestBuyRowByCategory.set(ap.categoryId, ap);
    }
  }
  const biggestBuyByCategory = Array.from(biggestBuyRowByCategory.values())
    .map((ap) => ({
      categoryName: ap.category.name,
      playerName: ap.player.name,
      teamName: ap.soldToEntry.team.name,
      price: ap.soldPrice.toString(),
      bidCount: ap._count.bids,
    }))
    .sort((a, b) => Number(b.price) - Number(a.price));

  const byCategory = new Map<string, { categoryName: string; total: number; count: number }>();
  for (const ap of sold) {
    const price = Number(ap.soldPrice);
    const existing = byCategory.get(ap.categoryId);
    if (existing) {
      existing.total += price;
      existing.count += 1;
    } else {
      byCategory.set(ap.categoryId, { categoryName: ap.category.name, total: price, count: 1 });
    }
  }
  const spendByCategory = Array.from(byCategory.values())
    .map((c) => ({ categoryName: c.categoryName, totalSpent: c.total.toString(), playersSold: c.count }))
    .sort((a, b) => Number(b.totalSpent) - Number(a.totalSpent));

  // Best value: skill-per-rupee among only what was actually bought — feeds
  // computePlayerValueScores just the sold pool so replacement level
  // reflects "weakest player someone actually paid for," then ranks by
  // value/price. AnalyticsPlayer.id must be the AuctionPlayer id (not
  // Player.id), matching lib/auction/analyticsAdapter.ts's own convention,
  // so the result maps back to a specific sale.
  const analyticsPlayers: AnalyticsPlayer[] = sold.map((ap) => ({
    id: ap.id,
    name: ap.player.name,
    categoryId: ap.categoryId,
    basePrice: 0, // unused by computePlayerValueScores; required by the shared type only
    position: ap.player.position,
    rating: ap.player.rating != null ? Number(ap.player.rating) : null,
    battingRating: ap.player.battingRating != null ? Number(ap.player.battingRating) : null,
    bowlingRating: ap.player.bowlingRating != null ? Number(ap.player.bowlingRating) : null,
    fieldingRating: ap.player.fieldingRating != null ? Number(ap.player.fieldingRating) : null,
  }));
  const soldById = new Map(sold.map((ap) => [ap.id, ap]));
  let bestValue: { row: (typeof sold)[number]; ratio: number } | null = null;
  for (const vs of computePlayerValueScores(analyticsPlayers)) {
    const row = soldById.get(vs.playerId)!;
    const price = Number(row.soldPrice);
    if (price <= 0) continue;
    const ratio = vs.value / price;
    if (!bestValue || ratio > bestValue.ratio) bestValue = { row, ratio };
  }

  return {
    auctionName: auction.name,
    tournamentName: auction.tournament.name,
    tournamentId: auction.tournament.id,
    completedAt: auction.completedAt!,
    soldCount: sold.length,
    unsoldCount: auction.auctionPlayers.length - sold.length,
    biggestBuyByCategory,
    bestValuePick: bestValue && {
      playerName: bestValue.row.player.name,
      categoryName: bestValue.row.category.name,
      teamName: bestValue.row.soldToEntry.team.name,
      price: bestValue.row.soldPrice.toString(),
    },
    spendByCategory,
  };
}
