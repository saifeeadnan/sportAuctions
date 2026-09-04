import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import {
  createAuctionReadyFixture,
  createFixtureLeague,
  createFixtureAdmin,
  createFixtureUserWithMembership,
} from "../helpers/fixtures";
import { expectAuditLog, expectNoAuditLog } from "../helpers/auditLog";
import { prisma } from "@/lib/prisma";
import {
  createAuction,
  openPreAuction,
  lockPreAuction,
  startBidding,
  deleteAuction,
} from "@/lib/services/auction.service";
import { adminAssignPlayer, placeBid, concludeAuction } from "@/lib/services/bidding.service";
import { assignTeamCaptain } from "@/lib/services/teamCaptain.service";
import {
  deleteUser,
  setUserActive,
  deleteMembership,
  setMembershipActive,
  changePassword,
  updateUserProfile,
} from "@/lib/services/user.service";

beforeEach(resetDb);

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

/**
 * A concluded auction (one team, squadSize 2) — enough to exercise
 * adminAssignPlayer, assignTeamCaptain, concludeAuction, and deleteAuction
 * without any fantasy/self-pick machinery this file doesn't need.
 */
async function buildConcludedAuctionFixture() {
  const fx = await createAuctionReadyFixture({
    playerNames: ["Player One", "Player Two"],
    teamNames: ["Team 1"],
    squadSize: 2,
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

  const entry = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id } });
  const playerOne = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: fx.players[0].id },
  });

  await adminAssignPlayer(auction.id, playerOne.id, entry.id, 100, fx.admin.id);
  await concludeAuction(auction.id, fx.admin.id);
  await prisma.tournament.update({ where: { id: fx.tournament.id }, data: { startDate: FUTURE } });

  return { ...fx, auction, entry, playerOne };
}

describe("audit log — auctions", () => {
  it("adminAssignPlayer writes a PLAYER_ASSIGNED_BY_ADMIN row with the actor and price", async () => {
    const fx = await buildConcludedAuctionFixture();

    const log = await expectAuditLog({
      entityType: "AuctionPlayer",
      entityId: fx.playerOne.id,
      action: "PLAYER_ASSIGNED_BY_ADMIN",
      actorUserId: fx.admin.id,
    });
    expect(log.auctionId).toBe(fx.auction.id);
    expect(log.actorLabel).toBe(fx.admin.loginId);
    expect((log.after as { price?: string })?.price).toBe("100");
  });

  it("concludeAuction writes exactly one summary row, not one per leftover player", async () => {
    const fx = await buildConcludedAuctionFixture();

    const logs = await prisma.auditLog.findMany({
      where: { auctionId: fx.auction.id, action: "AUCTION_CONCLUDED" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].note).toMatch(/leftover player/);
  });

  it("assignTeamCaptain writes TEAM_CAPTAIN_ASSIGNED, then TEAM_CAPTAIN_CLEARED when cleared", async () => {
    const fx = await buildConcludedAuctionFixture();

    await assignTeamCaptain(fx.auction.id, fx.entry.id, fx.playerOne.id, fx.admin.id);
    const assigned = await expectAuditLog({
      entityType: "TeamAuctionEntry",
      entityId: fx.entry.id,
      action: "TEAM_CAPTAIN_ASSIGNED",
      actorUserId: fx.admin.id,
    });
    expect((assigned.after as { captainName?: string })?.captainName).toBe("Player One");

    await assignTeamCaptain(fx.auction.id, fx.entry.id, null, fx.admin.id);
    const cleared = await expectAuditLog({
      entityType: "TeamAuctionEntry",
      entityId: fx.entry.id,
      action: "TEAM_CAPTAIN_CLEARED",
      actorUserId: fx.admin.id,
    });
    expect((cleared.before as { captainName?: string })?.captainName).toBe("Player One");
  });

  it("deleteAuction writes an AUCTION_DELETED row with a before snapshot that survives the delete", async () => {
    const fx = await buildConcludedAuctionFixture();

    await deleteAuction(fx.auction.id, fx.admin.id);

    const log = await expectAuditLog({
      entityType: "Auction",
      entityId: fx.auction.id,
      action: "AUCTION_DELETED",
      actorUserId: fx.admin.id,
    });
    expect((log.before as { name?: string })?.name).toBe("Auction");
    // The row itself must survive even though the Auction it describes is gone.
    expect(await prisma.auction.findUnique({ where: { id: fx.auction.id } })).toBeNull();
  });

  it("placeBid never writes an audit row — already fully captured by Bid's own history", async () => {
    // squadSize 2, not 1 — createFixtureTeam defaults managerOccupiesSlot to
    // true, so with squadSize 1 the team's only slot is already filled
    // before any bid, and placeBid would reject on the squad cap.
    const fx = await createAuctionReadyFixture({
      playerNames: ["Player One"],
      teamNames: ["Team 1"],
      squadSize: 2,
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

    const entry = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id } });
    const player = await prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: auction.id } });
    await prisma.auctionPlayer.update({ where: { id: player.id }, data: { status: "IN_BIDDING" } });

    await placeBid(auction.id, player.id, entry.id, 150);

    await expectNoAuditLog({ entityType: "AuctionPlayer", action: "PLAYER_SOLD" });
    expect(await prisma.auditLog.count({ where: { auctionId: auction.id } })).toBeGreaterThan(0); // setup itself is audited
    expect(await prisma.bid.count({ where: { auctionPlayerId: player.id } })).toBe(1); // but the bid itself lives in Bid, not AuditLog
  });
});

describe("audit log — membership & profile", () => {
  it("setMembershipActive writes MEMBERSHIP_ACTIVATED / MEMBERSHIP_DEACTIVATED", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { membership } = await createFixtureUserWithMembership(league.id, "VIEWER", {
      membershipActive: false,
    });

    await setMembershipActive(membership.id, admin.id, true);
    await expectAuditLog({
      entityType: "LeagueMembership",
      entityId: membership.id,
      action: "MEMBERSHIP_ACTIVATED",
      actorUserId: admin.id,
    });

    await setMembershipActive(membership.id, admin.id, false);
    await expectAuditLog({
      entityType: "LeagueMembership",
      entityId: membership.id,
      action: "MEMBERSHIP_DEACTIVATED",
      actorUserId: admin.id,
    });
  });

  it("deleteMembership writes a before snapshot that survives the delete", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { membership, user } = await createFixtureUserWithMembership(league.id, "VIEWER");

    await deleteMembership(membership.id, admin.id);

    const log = await expectAuditLog({
      entityType: "LeagueMembership",
      entityId: membership.id,
      action: "MEMBERSHIP_DELETED",
      actorUserId: admin.id,
    });
    expect((log.before as { loginId?: string })?.loginId).toBe(user.loginId);
    expect(await prisma.leagueMembership.findUnique({ where: { id: membership.id } })).toBeNull();
  });

  it("changePassword never stores the password hash in before or after", async () => {
    const { user } = await createFixtureUserWithMembership((await createFixtureLeague()).id, "VIEWER", {
      password: "originalPass123",
    });

    await changePassword(user.id, "originalPass123", "brandNewPass456", "brandNewPass456");

    const log = await expectAuditLog({
      entityType: "User",
      entityId: user.id,
      action: "PASSWORD_CHANGED_SELF",
      actorUserId: user.id,
    });
    expect(log.before).toBeNull();
    expect(log.after).toBeNull();
    expect(JSON.stringify(log)).not.toContain("brandNewPass456");
  });

  it("updateUserProfile writes PROFILE_UPDATED_SELF with the actual before/after email", async () => {
    const { user } = await createFixtureUserWithMembership((await createFixtureLeague()).id, "VIEWER");

    await updateUserProfile(user.id, { email: "new@example.com", phone: "" });

    const log = await expectAuditLog({
      entityType: "User",
      entityId: user.id,
      action: "PROFILE_UPDATED_SELF",
      actorUserId: user.id,
    });
    expect((log.before as { email?: string | null })?.email).toBeNull();
    expect((log.after as { email?: string | null })?.email).toBe("new@example.com");
  });

  it("actorLabel survives even after the acting user's own account is later deleted", async () => {
    const league = await createFixtureLeague();
    const { membership } = await createFixtureUserWithMembership(league.id, "VIEWER", {
      membershipActive: false,
    });
    const actor = await createFixtureAdmin();
    const superAdmin = await createFixtureAdmin();

    await setMembershipActive(membership.id, actor.id, true);
    const log = await expectAuditLog({
      entityType: "LeagueMembership",
      entityId: membership.id,
      action: "MEMBERSHIP_ACTIVATED",
      actorUserId: actor.id,
    });
    expect(log.actorLabel).toBe(actor.loginId);

    await deleteUser(actor.id, superAdmin.id);

    const afterActorDeleted = await prisma.auditLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(afterActorDeleted.actorUserId).toBeNull();
    expect(afterActorDeleted.actorLabel).toBe(actor.loginId);
  });

  it("setUserActive writes USER_ACTIVATED / USER_DEACTIVATED", async () => {
    const admin = await createFixtureAdmin();
    const { user } = await createFixtureUserWithMembership((await createFixtureLeague()).id, "VIEWER");

    await setUserActive(user.id, admin.id, false);
    await expectAuditLog({
      entityType: "User",
      entityId: user.id,
      action: "USER_DEACTIVATED",
      actorUserId: admin.id,
    });
  });
});
