import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { expectAuditLog, expectNoAuditLog } from "../helpers/auditLog";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";
import { submitFantasyTeam, getFantasyStandings } from "@/lib/services/fantasyTeam.service";
import { parsePointsFile } from "@/lib/services/playerPoints.service";
import {
  applyPointsUpload,
  deletePointsUpload,
  listPointsUploads,
  getPointsUploadRows,
} from "@/lib/services/fantasyPointsUpload.service";

beforeEach(resetDb);

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PLAYER_NAMES = ["Alpha Self", "Beta Self", "Shared Pick"];

async function createViewer(name: string) {
  // Date.now() alone collides when two viewers are created in the same ms.
  const loginId = `viewer-${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.user.create({
    data: { loginId, passwordHash: await bcrypt.hash("password123", 4), name },
  });
}

/**
 * A concluded auction where Team 1 won all three players (squadSize 4 —
 * the manager occupies one slot, so 3 is the most the team can hold), and two
 * viewers (Alice ↔ "Alpha Self", Bob ↔ "Beta Self", by loginId) each built a
 * fantasy team of their own self-pick plus "Shared Pick". Alice submits
 * first, so on a tie she leads the display order.
 */
async function buildFixture() {
  const fx = await createAuctionReadyFixture({
    playerNames: PLAYER_NAMES,
    teamNames: ["Team 1"],
    squadSize: 4,
  });
  const playerByName = (name: string) => fx.players.find((p) => p.name === name)!;

  const alice = await createViewer("Alice");
  const bob = await createViewer("Bob");
  await prisma.player.update({ where: { id: playerByName("Alpha Self").id }, data: { loginId: alice.loginId } });
  await prisma.player.update({ where: { id: playerByName("Beta Self").id }, data: { loginId: bob.loginId } });

  const auction = await createAuction({
    tournamentId: fx.tournament.id,
    name: "Points Auction",
    teamBudget: 1000,
    createdById: fx.admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });
  await openPreAuction(auction.id, fx.admin.id);
  await lockPreAuction(auction.id, true, fx.admin.id);
  await startBidding(auction.id, fx.admin.id);

  const entry = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id } });
  const auctionPlayers = await prisma.auctionPlayer.findMany({
    where: { auctionId: auction.id },
    include: { player: true },
  });
  const ap = (name: string) => auctionPlayers.find((x) => x.player.name === name)!;
  for (const name of PLAYER_NAMES) {
    await adminAssignPlayer(auction.id, ap(name).id, entry.id, 100, fx.admin.id);
  }
  await concludeAuction(auction.id, fx.admin.id);
  await prisma.tournament.update({ where: { id: fx.tournament.id }, data: { startDate: FUTURE } });

  const teamAlice = await submitFantasyTeam(
    auction.id,
    alice.id,
    [ap("Alpha Self").id, ap("Shared Pick").id],
    null,
    "Team Alice"
  );
  const teamBob = await submitFantasyTeam(
    auction.id,
    bob.id,
    [ap("Beta Self").id, ap("Shared Pick").id],
    null,
    "Team Bob"
  );

  return { auction, adminId: fx.admin.id, teamAlice, teamBob, ap };
}

async function upload(auctionId: string, adminId: string, csv: string, label?: string) {
  const { validRows } = parsePointsFile(Buffer.from(csv), "points.csv");
  return applyPointsUpload(auctionId, validRows, { actorUserId: adminId, fileName: "points.csv", label });
}

async function pointsByName(auctionId: string) {
  const rows = await prisma.auctionPlayer.findMany({
    where: { auctionId },
    select: { points: true, player: { select: { name: true } } },
  });
  return Object.fromEntries(rows.map((r) => [r.player.name, r.points != null ? Number(r.points) : null]));
}

// Alice 10 + 5 = 15, Bob 20 + 5 = 25 → Bob #1, Alice #2.
const CSV_ROUND_1 = "Player,Points\nAlpha Self,10\nBeta Self,20\nShared Pick,5\n";
// Only Alice's self-pick moves: Alice 40 + 5 = 45 vs Bob 25 → Alice overtakes.
const CSV_ROUND_2 = "Player,Points\nAlpha Self,40\n";
// Bob catches up exactly: 45 vs 45 → a shared #1.
const CSV_ROUND_3 = "Player,Points\nBeta Self,40\n";

describe("applyPointsUpload", () => {
  it("records the first upload as a full snapshot and ranks by points with no movement yet", async () => {
    const { auction, adminId, teamAlice, teamBob } = await buildFixture();

    const result = await upload(auction.id, adminId, CSV_ROUND_1, "  Round 1  ");
    expect(result.updatedCount).toBe(3);
    expect(result.unmatched).toEqual([]);
    expect(result.uploadId).not.toBeNull();

    const uploads = await listPointsUploads(auction.id);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({ id: result.uploadId, label: "Round 1", rowCount: 3, playerCount: 3 });
    expect(uploads[0].uploadedBy?.name).toBeTruthy();

    const { hasPoints, standings, latestUpload, previousUpload } = await getFantasyStandings(auction.id);
    expect(hasPoints).toBe(true);
    expect(latestUpload?.id).toBe(result.uploadId);
    expect(previousUpload).toBeNull();
    expect(standings.map((s) => [s.team.id, s.rank, s.totalPoints])).toEqual([
      [teamBob.id, 1, 25],
      [teamAlice.id, 2, 15],
    ]);
    expect(standings.every((s) => s.previousRank === null && s.rankDelta === null && s.pointsDelta === null)).toBe(
      true
    );
  });

  it("carries forward players absent from a later CSV and reports rank movement against the previous upload", async () => {
    const { auction, adminId, teamAlice, teamBob } = await buildFixture();
    const first = await upload(auction.id, adminId, CSV_ROUND_1);
    const second = await upload(auction.id, adminId, CSV_ROUND_2);

    // The second CSV only named Alpha Self, yet the snapshot holds all three.
    const secondEntries = await prisma.fantasyPointsUploadEntry.findMany({ where: { uploadId: second.uploadId! } });
    expect(secondEntries).toHaveLength(3);
    expect((await listPointsUploads(auction.id)).map((u) => [u.id, u.rowCount, u.playerCount])).toEqual([
      [second.uploadId, 1, 3],
      [first.uploadId, 3, 3],
    ]);
    expect(await pointsByName(auction.id)).toEqual({ "Alpha Self": 40, "Beta Self": 20, "Shared Pick": 5 });

    const { standings, latestUpload, previousUpload } = await getFantasyStandings(auction.id);
    expect(latestUpload?.id).toBe(second.uploadId);
    expect(previousUpload?.id).toBe(first.uploadId);
    const alice = standings.find((s) => s.team.id === teamAlice.id)!;
    const bob = standings.find((s) => s.team.id === teamBob.id)!;
    expect(alice).toMatchObject({ rank: 1, previousRank: 2, rankDelta: 1, totalPoints: 45, pointsDelta: 30 });
    expect(bob).toMatchObject({ rank: 2, previousRank: 1, rankDelta: -1, totalPoints: 25, pointsDelta: 0 });
  });

  it("gives tied teams the same rank, so a tie never shows as an overtake", async () => {
    const { auction, adminId, teamAlice, teamBob } = await buildFixture();
    await upload(auction.id, adminId, CSV_ROUND_1);
    await upload(auction.id, adminId, CSV_ROUND_2);
    await upload(auction.id, adminId, CSV_ROUND_3);

    const { standings } = await getFantasyStandings(auction.id);
    const alice = standings.find((s) => s.team.id === teamAlice.id)!;
    const bob = standings.find((s) => s.team.id === teamBob.id)!;
    expect([alice.rank, bob.rank]).toEqual([1, 1]);
    expect(alice).toMatchObject({ previousRank: 1, rankDelta: 0, pointsDelta: 0 });
    expect(bob).toMatchObject({ previousRank: 2, rankDelta: 1, pointsDelta: 20 });
    // Display order among ties follows submission order (Alice first).
    expect(standings.map((s) => s.team.id)).toEqual([teamAlice.id, teamBob.id]);
  });

  it("takes no snapshot and writes no audit row when no CSV row matches a player", async () => {
    const { auction, adminId } = await buildFixture();

    const result = await upload(auction.id, adminId, "Player,Points\nNobody Here,9\n");
    expect(result).toMatchObject({ uploadId: null, uploadedAt: null, updatedCount: 0 });
    expect(result.unmatched).toHaveLength(1);
    expect(await listPointsUploads(auction.id)).toEqual([]);
    expect(await pointsByName(auction.id)).toEqual({ "Alpha Self": null, "Beta Self": null, "Shared Pick": null });
    await expectNoAuditLog({ entityType: "FantasyPointsUpload", action: "FANTASY_POINTS_UPLOADED" });
  });

  it("audits each upload once, keyed by the upload id", async () => {
    const { auction, adminId } = await buildFixture();
    const first = await upload(auction.id, adminId, CSV_ROUND_1, "Round 1");

    const row = await expectAuditLog({
      entityType: "FantasyPointsUpload",
      entityId: first.uploadId!,
      action: "FANTASY_POINTS_UPLOADED",
      actorUserId: adminId,
    });
    expect(row.auctionId).toBe(auction.id);
    expect(row.after).toEqual({ rowCount: 3, playerCount: 3, label: "Round 1", fileName: "points.csv" });
  });
});

describe("deletePointsUpload", () => {
  it("deleting the latest upload reverts player points to the previous snapshot", async () => {
    const { auction, adminId, teamAlice } = await buildFixture();
    const first = await upload(auction.id, adminId, CSV_ROUND_1);
    const second = await upload(auction.id, adminId, CSV_ROUND_2);

    await deletePointsUpload(auction.id, second.uploadId!, adminId);

    expect(await pointsByName(auction.id)).toEqual({ "Alpha Self": 10, "Beta Self": 20, "Shared Pick": 5 });
    const { standings, latestUpload, previousUpload } = await getFantasyStandings(auction.id);
    expect(latestUpload?.id).toBe(first.uploadId);
    expect(previousUpload).toBeNull();
    expect(standings.find((s) => s.team.id === teamAlice.id)).toMatchObject({ rank: 2, rankDelta: null });

    const row = await expectAuditLog({
      entityType: "FantasyPointsUpload",
      entityId: second.uploadId!,
      action: "FANTASY_POINTS_UPLOAD_DELETED",
      actorUserId: adminId,
    });
    expect(row.note).toContain("reverted");
    expect((row.before as { rowCount?: number }).rowCount).toBe(1);
  });

  it("deleting an older upload leaves current points alone but changes the comparison baseline", async () => {
    const { auction, adminId, teamAlice, teamBob } = await buildFixture();
    const first = await upload(auction.id, adminId, CSV_ROUND_1);
    const second = await upload(auction.id, adminId, CSV_ROUND_2);
    const third = await upload(auction.id, adminId, CSV_ROUND_3);

    await deletePointsUpload(auction.id, second.uploadId!, adminId);

    expect(await pointsByName(auction.id)).toEqual({ "Alpha Self": 40, "Beta Self": 40, "Shared Pick": 5 });
    const { standings, latestUpload, previousUpload } = await getFantasyStandings(auction.id);
    expect(latestUpload?.id).toBe(third.uploadId);
    expect(previousUpload?.id).toBe(first.uploadId);
    // Against round 1 (Bob 25, Alice 15) both now sit on 45: Alice up one, Bob unchanged.
    expect(standings.find((s) => s.team.id === teamAlice.id)).toMatchObject({ rank: 1, previousRank: 2, rankDelta: 1 });
    expect(standings.find((s) => s.team.id === teamBob.id)).toMatchObject({ rank: 1, previousRank: 1, rankDelta: 0 });
  });

  it("deleting the last remaining upload clears every player's points", async () => {
    const { auction, adminId } = await buildFixture();
    const only = await upload(auction.id, adminId, CSV_ROUND_1);

    await deletePointsUpload(auction.id, only.uploadId!, adminId);

    expect(await pointsByName(auction.id)).toEqual({ "Alpha Self": null, "Beta Self": null, "Shared Pick": null });
    expect(await listPointsUploads(auction.id)).toEqual([]);
    const { hasPoints, latestUpload, standings } = await getFantasyStandings(auction.id);
    expect(hasPoints).toBe(false);
    expect(latestUpload).toBeNull();
    expect(standings.every((s) => s.rankDelta === null)).toBe(true);
    const row = await expectAuditLog({
      entityType: "FantasyPointsUpload",
      entityId: only.uploadId!,
      action: "FANTASY_POINTS_UPLOAD_DELETED",
    });
    expect(row.note).toContain("cleared");
  });

  it("rejects an unknown upload, and one that belongs to a different auction", async () => {
    const { auction, adminId } = await buildFixture();
    const only = await upload(auction.id, adminId, CSV_ROUND_1);

    await expect(deletePointsUpload(auction.id, "nope", adminId)).rejects.toThrow(/not found/);
    await expect(deletePointsUpload("other-auction", only.uploadId!, adminId)).rejects.toThrow(/not found/);
    expect(await listPointsUploads(auction.id)).toHaveLength(1);
  });
});

describe("getPointsUploadRows", () => {
  it("returns a snapshot's full rows, highest points first, including carried-forward players", async () => {
    const { auction, adminId } = await buildFixture();
    await upload(auction.id, adminId, CSV_ROUND_1);
    const second = await upload(auction.id, adminId, CSV_ROUND_2, "Round 2");

    const snapshot = await getPointsUploadRows(auction.id, second.uploadId!);
    expect(snapshot!.upload).toMatchObject({ id: second.uploadId, label: "Round 2" });
    // Beta Self and Shared Pick weren't in the round-2 CSV but are in its snapshot.
    expect(snapshot!.rows.map((r) => [r.playerName, r.points])).toEqual([
      ["Alpha Self", "40"],
      ["Beta Self", "20"],
      ["Shared Pick", "5"],
    ]);
    expect(snapshot!.rows.every((r) => r.categoryName === "Regular")).toBe(true);
    expect(snapshot!.rows.find((r) => r.playerName === "Alpha Self")!.loginId).toMatch(/^viewer-alice-/);
  });

  it("returns null for an unknown upload or one from a different auction", async () => {
    const { auction, adminId } = await buildFixture();
    const only = await upload(auction.id, adminId, CSV_ROUND_1);

    expect(await getPointsUploadRows(auction.id, "nope")).toBeNull();
    expect(await getPointsUploadRows("other-auction", only.uploadId!)).toBeNull();
  });
});
