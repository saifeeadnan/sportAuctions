import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { ValidationError } from "@/lib/errors";

export type ResolveOverlapsResult = {
  autoAllocated: number;
  sentToPool: number;
  warnings: string[];
};

export async function resolveOverlaps(auctionId: string): Promise<ResolveOverlapsResult> {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");

  const [auctionPlayers, entries, submissions] = await Promise.all([
    prisma.auctionPlayer.findMany({
      where: { auctionId, status: "AVAILABLE" },
      include: { category: true },
    }),
    prisma.teamAuctionEntry.findMany({ where: { auctionId }, include: { team: true } }),
    prisma.preAuctionSubmission.findMany({
      where: { teamAuctionEntry: { auctionId } },
    }),
  ]);

  const submissionsByPlayer = new Map<string, string[]>();
  for (const s of submissions) {
    const list = submissionsByPlayer.get(s.auctionPlayerId) ?? [];
    list.push(s.teamAuctionEntryId);
    submissionsByPlayer.set(s.auctionPlayerId, list);
  }

  const entryState = new Map(
    entries.map((e) => [
      e.id,
      { budgetRemaining: new Prisma.Decimal(e.budgetRemaining), slotsFilled: e.slotsFilled, slotsTotal: e.slotsTotal, teamName: e.team.name },
    ])
  );

  const allocations: { auctionPlayerId: string; entryId: string; price: Prisma.Decimal }[] = [];
  const pooled: string[] = [];
  const warnings: string[] = [];

  for (const ap of auctionPlayers) {
    const pickedBy = submissionsByPlayer.get(ap.id) ?? [];

    if (pickedBy.length === 0) {
      continue; // stays AVAILABLE
    }

    if (pickedBy.length > 1) {
      pooled.push(ap.id);
      continue;
    }

    const entryId = pickedBy[0];
    const state = entryState.get(entryId);
    const basePrice = new Prisma.Decimal(ap.category.basePrice);

    if (!state || state.budgetRemaining.lessThan(basePrice) || state.slotsFilled >= state.slotsTotal) {
      warnings.push(
        `Player "${ap.playerId}" could not be auto-allocated (insufficient budget/slots) and was sent to the live auction pool instead`
      );
      pooled.push(ap.id);
      continue;
    }

    state.budgetRemaining = state.budgetRemaining.minus(basePrice);
    state.slotsFilled += 1;
    allocations.push({ auctionPlayerId: ap.id, entryId, price: basePrice });
  }

  await prisma.$transaction(async (tx) => {
    for (const alloc of allocations) {
      await tx.auctionPlayer.update({
        where: { id: alloc.auctionPlayerId },
        data: {
          status: "SOLD",
          soldVia: "PRE_AUCTION_DRAFT",
          soldToEntryId: alloc.entryId,
          soldPrice: alloc.price,
        },
      });
    }

    if (pooled.length > 0) {
      await tx.auctionPlayer.updateMany({
        where: { id: { in: pooled } },
        data: { status: "IN_PRE_AUCTION_POOL" },
      });
    }

    for (const [entryId, state] of entryState.entries()) {
      await tx.teamAuctionEntry.update({
        where: { id: entryId },
        data: {
          budgetRemaining: state.budgetRemaining,
          slotsFilled: state.slotsFilled,
          status: "ALLOCATED_PRE_AUCTION",
        },
      });
    }
  });

  return { autoAllocated: allocations.length, sentToPool: pooled.length, warnings };
}
