import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";
import { assertAuctionLeagueNotReadOnly } from "@/lib/services/league.service";
import { repriceFantasyTeamPlayers } from "@/lib/services/fantasyTeam.service";
import { writeAuditLog } from "@/lib/services/auditLog.service";

function assertCompleted(auction: { status: string }) {
  if (auction.status !== "COMPLETED") {
    throw new InvalidStateTransitionError(
      "Corrections are only available once the auction has concluded"
    );
  }
}

export type CorrectSoldPriceResult =
  | { status: "applied" }
  | { status: "needs_confirmation"; teamName: string; currentBudget: string; suggestedBudget: string };

/**
 * Fixes a sold-price typo on a COMPLETED auction. TeamAuctionEntry.budgetRemaining
 * is never "teamBudget - sum(soldPrice)" — every team's manager-slot fee is baked
 * into it once at entry-creation time and stored nowhere else (see
 * planTeamAuctionEntries in auction.service.ts) — so this always shifts the
 * affected team's stored budgetRemaining by the price delta rather than
 * recomputing it from scratch, which would silently drop that fee.
 *
 * If the delta would push the team's budgetRemaining negative, this returns
 * (never throws) a needs_confirmation result with a suggested new team budget
 * — the minimum raise needed — instead of writing anything. Passing that
 * value back in as confirmedTeamBudget applies the correction and raises the
 * budget together in one transaction. Raising the shared team budget can only
 * ever help every other team, never hurt them, so only the directly-affected
 * team's projected balance needs checking.
 */
export async function correctSoldPrice(
  auctionId: string,
  auctionPlayerId: string,
  newPrice: number,
  adminUserId: string,
  confirmedTeamBudget?: number
): Promise<CorrectSoldPriceResult> {
  await assertAuctionLeagueNotReadOnly(auctionId);
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    throw new ValidationError("Price must be greater than 0");
  }

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  assertCompleted(auction);

  const auctionPlayer = await prisma.auctionPlayer.findUnique({
    where: { id: auctionPlayerId },
    include: { player: true },
  });
  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (auctionPlayer.status !== "SOLD" || !auctionPlayer.soldToEntryId || auctionPlayer.soldPrice == null) {
    throw new InvalidStateTransitionError(
      `Cannot correct a sold price for a player with status ${auctionPlayer.status}`
    );
  }

  const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({
    where: { id: auctionPlayer.soldToEntryId },
    include: { team: true },
  });

  const newPriceDecimal = new Prisma.Decimal(newPrice);
  const priceDelta = newPriceDecimal.minus(auctionPlayer.soldPrice);
  const projectedBudgetRemaining = new Prisma.Decimal(entry.budgetRemaining).minus(priceDelta);

  let newTeamBudget: Prisma.Decimal | null = null;
  let budgetDelta = new Prisma.Decimal(0);

  if (projectedBudgetRemaining.lessThan(0)) {
    const deficit = projectedBudgetRemaining.abs();
    const suggestedBudget = new Prisma.Decimal(auction.teamBudget).plus(deficit);

    if (confirmedTeamBudget == null) {
      return {
        status: "needs_confirmation",
        teamName: entry.team.name,
        currentBudget: auction.teamBudget.toString(),
        suggestedBudget: suggestedBudget.toString(),
      };
    }

    const confirmedDecimal = new Prisma.Decimal(confirmedTeamBudget);
    if (confirmedDecimal.lessThan(suggestedBudget)) {
      throw new ValidationError(
        `Confirmed budget (${confirmedDecimal}) still isn't enough — needs at least ${suggestedBudget}`
      );
    }
    newTeamBudget = confirmedDecimal;
    budgetDelta = confirmedDecimal.minus(auction.teamBudget);
  }

  await prisma.$transaction(async (tx) => {
    await tx.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: { soldPrice: newPriceDecimal },
    });

    if (newTeamBudget != null) {
      const allEntries = await tx.teamAuctionEntry.findMany({ where: { auctionId } });
      for (const e of allEntries) {
        const perTeamPriceDelta = e.id === entry.id ? priceDelta : new Prisma.Decimal(0);
        await tx.teamAuctionEntry.update({
          where: { id: e.id },
          data: {
            budgetRemaining: new Prisma.Decimal(e.budgetRemaining).plus(budgetDelta).minus(perTeamPriceDelta),
          },
        });
      }
      await tx.auction.update({ where: { id: auctionId }, data: { teamBudget: newTeamBudget } });
    } else {
      await tx.teamAuctionEntry.update({
        where: { id: entry.id },
        data: { budgetRemaining: projectedBudgetRemaining },
      });
    }

    // Unconditional, not just when a category-average pricing model is in
    // play: a narrow "set this one player's picks to the new sold price"
    // update would silently corrupt any fantasy pick of this player that's
    // actually someone's self-pick — those must never reflect sold price at
    // all (they're always priced at their category's average) — and under
    // CATEGORY_AVERAGE mode this one player's price shift also moves the
    // whole category's average for every other pick in it. Repricing
    // everything from scratch is the only way to stay correct in both cases.
    await repriceFantasyTeamPlayers(auctionId, tx);

    await writeAuditLog(tx, {
      entityType: "AuctionPlayer",
      entityId: auctionPlayerId,
      auctionId,
      action: "SOLD_PRICE_CORRECTED",
      actorUserId: adminUserId,
      before: { soldPrice: auctionPlayer.soldPrice!.toString() },
      after: { soldPrice: newPriceDecimal.toString() },
    });
    if (newTeamBudget != null) {
      await writeAuditLog(tx, {
        entityType: "Auction",
        entityId: auctionId,
        auctionId,
        action: "TEAM_BUDGET_CORRECTED",
        actorUserId: adminUserId,
        before: { teamBudget: auction.teamBudget.toString() },
        after: { teamBudget: newTeamBudget.toString() },
        note: `Raised to accommodate sold-price correction on ${auctionPlayer.player.name}`,
      });
    }
  });

  return { status: "applied" };
}

/**
 * Fixes a category base-price typo on a COMPLETED auction. Never touches any
 * TeamAuctionEntry.budgetRemaining, which is derived solely from soldPrice —
 * but does trigger a full fantasy-price reprice for the auction (see
 * repriceFantasyTeamPlayers), since this can change what an UNSOLD or
 * self-picked player in this category is worth for fantasy purposes.
 */
export async function correctCategoryBasePrice(
  auctionId: string,
  categoryId: string,
  newBasePrice: number,
  adminUserId: string
) {
  await assertAuctionLeagueNotReadOnly(auctionId);
  if (!Number.isFinite(newBasePrice) || newBasePrice <= 0) {
    throw new ValidationError("Base price must be greater than 0");
  }

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  assertCompleted(auction);

  const category = await prisma.auctionCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.auctionId !== auctionId) {
    throw new ValidationError("Category does not belong to this auction");
  }

  const newBasePriceDecimal = new Prisma.Decimal(newBasePrice);

  await prisma.$transaction(async (tx) => {
    await tx.auctionCategory.update({
      where: { id: categoryId },
      data: { basePrice: newBasePriceDecimal },
    });

    // Unconditional, same reasoning as correctSoldPrice above: a narrow
    // "set this category's unsold players to the new base price" update
    // would miss a self-pick in a zero-SOLD category (which should get the
    // category average, not basePrice, the moment any player in it sells —
    // but while the category stays entirely unsold, basePrice IS the
    // correct fallback for a self-pick too, so this correction can still
    // change it) and would never touch SOLD players' picks even under
    // CATEGORY_AVERAGE mode, where a base-price change alone actually has no
    // effect on the average (computed only from SOLD prices) but a full
    // reprice stays correct and cheap either way.
    await repriceFantasyTeamPlayers(auctionId, tx);

    await writeAuditLog(tx, {
      entityType: "AuctionCategory",
      entityId: categoryId,
      auctionId,
      action: "CATEGORY_BASE_PRICE_CORRECTED",
      actorUserId: adminUserId,
      before: { basePrice: category.basePrice.toString() },
      after: { basePrice: newBasePriceDecimal.toString() },
    });
  });
}

/**
 * Direct team-budget typo fix on a COMPLETED auction, independent of the
 * overage-confirmation flow in correctSoldPrice. Delta-shifts every team's
 * budgetRemaining by the same amount, same pattern as
 * updateAuctionTeamSettings's pre-completion budget edit — never a
 * from-scratch recompute. A decrease that would put any team into deficit is
 * rejected outright; there's no sensible "suggested" lower value the way
 * there is for a raise.
 */
export async function correctTeamBudget(auctionId: string, newTeamBudget: number, adminUserId: string) {
  await assertAuctionLeagueNotReadOnly(auctionId);
  if (!Number.isFinite(newTeamBudget) || newTeamBudget <= 0) {
    throw new ValidationError("Team budget must be greater than 0");
  }

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { entries: { include: { team: true } } },
  });
  if (!auction) throw new ValidationError("Auction not found");
  assertCompleted(auction);

  const newTeamBudgetDecimal = new Prisma.Decimal(newTeamBudget);
  const budgetDelta = newTeamBudgetDecimal.minus(auction.teamBudget);

  const violations: string[] = [];
  const plan = auction.entries.map((entry) => {
    const newBudgetRemaining = new Prisma.Decimal(entry.budgetRemaining).plus(budgetDelta);
    if (newBudgetRemaining.lessThan(0)) {
      violations.push(`"${entry.team.name}" would go ${newBudgetRemaining.toString()} into deficit`);
    }
    return { entryId: entry.id, newBudgetRemaining };
  });
  if (violations.length > 0) {
    throw new ValidationError(`Insufficient budget: ${violations.join("; ")}`);
  }

  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      await tx.teamAuctionEntry.update({
        where: { id: p.entryId },
        data: { budgetRemaining: p.newBudgetRemaining },
      });
    }
    await tx.auction.update({ where: { id: auctionId }, data: { teamBudget: newTeamBudgetDecimal } });
    await writeAuditLog(tx, {
      entityType: "Auction",
      entityId: auctionId,
      auctionId,
      action: "TEAM_BUDGET_CORRECTED",
      actorUserId: adminUserId,
      before: { teamBudget: auction.teamBudget.toString() },
      after: { teamBudget: newTeamBudgetDecimal.toString() },
    });
  });
}
