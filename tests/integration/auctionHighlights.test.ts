import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, selectNextPlayer, placeBid, recordSale, concludeAuction } from "@/lib/services/bidding.service";
import { getOrCreateHighlightsToken, getAuctionHighlights } from "@/lib/services/auctionHighlights.service";
import { assignTeamCaptain } from "@/lib/services/teamCaptain.service";

beforeEach(resetDb);

/**
 * A concluded, two-category auction: "Star Player" (Gold, sold 500, Team 1)
 * is the biggest buy; "Value Player" (Gold, sold 100, Team 1) has a much
 * higher rating than Star Player when `setValueRatings` is true, so within
 * the Gold category its skill-value (relative to Star Player as the
 * category's replacement level) divided by its low price makes it the clear
 * best-value pick regardless of the exact skillScore formula — Star Player's
 * own value is always 0 (it IS the replacement level), so its ratio is 0
 * against Value Player's strictly positive one. "Average Player" (Silver,
 * sold 50, Team 2) and "Unsold Player" (Silver, never assigned) round out
 * the category-spend/unsold assertions. Star Player is sold via two real
 * live bids (selectNextPlayer + placeBid + recordSale) so its bidCount is
 * 2; Value Player and Average Player are direct adminAssignPlayer sales
 * with bidCount 0 — covers both cases for the per-category biggest-buy
 * bid-count assertion.
 */
async function buildHighlightsFixture(options?: { setValueRatings?: boolean }) {
  const fx = await createAuctionReadyFixture({
    playerNames: ["Star Player", "Value Player", "Average Player", "Unsold Player"],
    teamNames: ["Team 1", "Team 2"],
    squadSize: 3,
  });
  const byName = (name: string) => fx.players.find((p) => p.name === name)!;
  const starPlayer = byName("Star Player");
  const valuePlayer = byName("Value Player");
  const averagePlayer = byName("Average Player");
  const unsoldPlayer = byName("Unsold Player");

  if (options?.setValueRatings) {
    await prisma.player.update({ where: { id: starPlayer.id }, data: { rating: 1 } });
    await prisma.player.update({ where: { id: valuePlayer.id }, data: { rating: 10 } });
  }

  const auction = await createAuction({
    tournamentId: fx.tournament.id,
    name: "Highlights Auction",
    teamBudget: 2000,
    createdById: fx.admin.id,
    categories: [
      { name: "Gold", basePrice: 100 },
      { name: "Silver", basePrice: 50 },
    ],
    playerAssignments: [
      { playerId: starPlayer.id, categoryName: "Gold" },
      { playerId: valuePlayer.id, categoryName: "Gold" },
      { playerId: averagePlayer.id, categoryName: "Silver" },
      { playerId: unsoldPlayer.id, categoryName: "Silver" },
    ],
  });

  await openPreAuction(auction.id, fx.admin.id);
  await lockPreAuction(auction.id, true, fx.admin.id);
  await startBidding(auction.id, fx.admin.id);

  const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 1" } },
  });
  const team2Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 2" } },
  });

  const starAP = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: starPlayer.id },
  });
  const valueAP = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: valuePlayer.id },
  });
  const averageAP = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: averagePlayer.id },
  });

  await selectNextPlayer(auction.id, starAP.id);
  await placeBid(auction.id, starAP.id, team2Entry.id, 300);
  // placeBid's 2-second anti-spam cooldown (bidCooldownUntil) would reject an
  // immediate second bid on the same player — clear it directly rather than
  // slowing the test down with a real sleep.
  await prisma.auctionPlayer.update({ where: { id: starAP.id }, data: { bidCooldownUntil: null } });
  await placeBid(auction.id, starAP.id, team1Entry.id, 500);
  await recordSale(auction.id, starAP.id, team1Entry.id, 500, fx.admin.id);
  await adminAssignPlayer(auction.id, valueAP.id, team1Entry.id, 100, fx.admin.id);
  await adminAssignPlayer(auction.id, averageAP.id, team2Entry.id, 50, fx.admin.id);
  // "Unsold Player" is deliberately left unassigned — concludeAuction flips it to UNSOLD.

  await concludeAuction(auction.id, fx.admin.id);

  return { auction, adminId: fx.admin.id, team1Entry, team2Entry, starAP, valueAP, averageAP };
}

describe("getOrCreateHighlightsToken", () => {
  it("rejects creating a link before the auction is completed", async () => {
    const fx = await createAuctionReadyFixture({
      playerNames: ["Player"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const auction = await createAuction({
      tournamentId: fx.tournament.id,
      name: "Auction",
      teamBudget: 1000,
      createdById: fx.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await openPreAuction(auction.id, fx.admin.id);
    await lockPreAuction(auction.id, true, fx.admin.id);
    await startBidding(auction.id, fx.admin.id);

    await expect(getOrCreateHighlightsToken(auction.id)).rejects.toThrow(
      /only be created once the auction has concluded/
    );
  });

  it("is idempotent — a second call returns the same token", async () => {
    const { auction } = await buildHighlightsFixture();

    const first = await getOrCreateHighlightsToken(auction.id);
    const second = await getOrCreateHighlightsToken(auction.id);
    expect(second).toBe(first);

    const fromDb = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(fromDb.highlightsToken).toBe(first);
  });
});

describe("getAuctionHighlights", () => {
  it("returns null for an unknown token", async () => {
    expect(await getAuctionHighlights("does-not-exist")).toBeNull();
  });

  it("computes the biggest buy per category (with bid counts), spend by category, and excludes unsold players", async () => {
    const { auction } = await buildHighlightsFixture();
    const token = await getOrCreateHighlightsToken(auction.id);

    const highlights = await getAuctionHighlights(token);
    expect(highlights).not.toBeNull();
    expect(highlights!.soldCount).toBe(3);
    expect(highlights!.unsoldCount).toBe(1);

    expect(highlights!.biggestBuyByCategory).toEqual([
      { categoryName: "Gold", playerName: "Star Player", photoUrl: null, teamName: "Team 1", price: "500", bidCount: 2 },
      { categoryName: "Silver", playerName: "Average Player", photoUrl: null, teamName: "Team 2", price: "50", bidCount: 0 },
    ]);

    const gold = highlights!.spendByCategory.find((c) => c.categoryName === "Gold")!;
    expect(gold.playersSold).toBe(2);
    expect(gold.totalSpent).toBe("600");
    const silver = highlights!.spendByCategory.find((c) => c.categoryName === "Silver")!;
    expect(silver.playersSold).toBe(1);
    expect(silver.totalSpent).toBe("50");
    // "Unsold Player" never contributes to Silver's totals.
    expect(highlights!.spendByCategory.reduce((n, c) => n + c.playersSold, 0)).toBe(3);
  });

  it("picks the cheap, high-skill player as best value over the expensive star", async () => {
    const { auction } = await buildHighlightsFixture({ setValueRatings: true });
    const token = await getOrCreateHighlightsToken(auction.id);

    const highlights = await getAuctionHighlights(token);
    expect(highlights!.bestValuePick).toEqual({
      playerName: "Value Player",
      photoUrl: null,
      categoryName: "Gold",
      teamName: "Team 1",
      price: "100",
    });
  });

  it("still returns a deterministic, non-null best value pick when no sold player has any rating set", async () => {
    const { auction } = await buildHighlightsFixture(); // setValueRatings not passed -> all ratings stay null
    const token = await getOrCreateHighlightsToken(auction.id);

    const highlights = await getAuctionHighlights(token);
    expect(highlights!.bestValuePick).not.toBeNull();
  });

  it("returns an empty teamCaptains list when no captain has been assigned", async () => {
    const { auction } = await buildHighlightsFixture();
    const token = await getOrCreateHighlightsToken(auction.id);

    const highlights = await getAuctionHighlights(token);
    expect(highlights!.teamCaptains).toEqual([]);
  });

  it("lists every assigned captain, one per team, sorted by team name", async () => {
    const { auction, team1Entry, team2Entry, starAP, averageAP, adminId } = await buildHighlightsFixture();
    await assignTeamCaptain(auction.id, team1Entry.id, starAP.id, adminId);
    await assignTeamCaptain(auction.id, team2Entry.id, averageAP.id, adminId);
    const token = await getOrCreateHighlightsToken(auction.id);

    const highlights = await getAuctionHighlights(token);
    expect(highlights!.teamCaptains).toEqual([
      { playerName: "Star Player", photoUrl: null, categoryName: "Gold", teamName: "Team 1", price: "500" },
      { playerName: "Average Player", photoUrl: null, categoryName: "Silver", teamName: "Team 2", price: "50" },
    ]);
  });
});
