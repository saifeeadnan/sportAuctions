import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureLeague, createFixtureAdmin, createFixtureRoster } from "../helpers/fixtures";

// See tests/integration/authScope.test.ts for why these mocks exist —
// lib/auth/guards.ts (imported transitively via playerPhoto.service.ts's
// AuthError) pulls in next-auth's real "@/auth", which doesn't resolve
// under Vitest's plain Node environment. Nothing here calls the real
// auth() function.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { prisma } from "@/lib/prisma";
import { updateUserProfilePhoto, deleteUser } from "@/lib/services/user.service";
import { updatePlayer } from "@/lib/services/roster.service";
import {
  assertOwnsPlayer,
  updatePlayerPhotoSelf,
  removePlayerPhotoSelf,
  linkPlayerPhotoToProfile,
  linkPlayerPhotosToProfile,
  getResolvedPlayerPhoto,
} from "@/lib/services/playerPhoto.service";
import { expectAuditLog, expectNoAuditLog } from "../helpers/auditLog";

beforeEach(resetDb);

const tinyJpegFile = (sizeBytes = 10) => ({
  type: "image/jpeg",
  data: Buffer.alloc(sizeBytes, 1),
});

/** A User whose loginId case-insensitively matches a freshly-created Player
 * on a freshly-created roster — the minimal self-match setup every test
 * here builds on. */
async function createMatchedUserAndPlayer(loginId = "Alice") {
  const league = await createFixtureLeague();
  const admin = await createFixtureAdmin();
  const { roster, players } = await createFixtureRoster(league.id, admin.id, [`${loginId} Example`]);
  await prisma.player.update({ where: { id: players[0].id }, data: { loginId } });
  const user = await prisma.user.create({
    data: {
      loginId: loginId.toLowerCase(),
      passwordHash: "x",
      name: loginId,
    },
  });
  return { league, admin, roster, player: players[0], user };
}

describe("assertOwnsPlayer", () => {
  it("matches case-insensitively", async () => {
    const { user, player } = await createMatchedUserAndPlayer("Alice");
    const owned = await assertOwnsPlayer(user.id, player.id);
    expect(owned.id).toBe(player.id);
  });

  it("rejects a Player the caller's loginId doesn't match", async () => {
    const { user } = await createMatchedUserAndPlayer("Alice");
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { players: otherPlayers } = await createFixtureRoster(league.id, admin.id, ["Bob Example"]);
    await prisma.player.update({ where: { id: otherPlayers[0].id }, data: { loginId: "bob" } });

    await expect(assertOwnsPlayer(user.id, otherPlayers[0].id)).rejects.toThrow(AuthErrorMessage);
  });

  it("a loginId match on one roster does not grant access to an unrelated Player on another roster", async () => {
    const { user } = await createMatchedUserAndPlayer("Alice");
    const league2 = await createFixtureLeague();
    const admin2 = await createFixtureAdmin();
    const { players: league2Players } = await createFixtureRoster(league2.id, admin2.id, ["Someone Else"]);
    // No loginId set on this one at all.
    await expect(assertOwnsPlayer(user.id, league2Players[0].id)).rejects.toThrow(AuthErrorMessage);
  });

  it("the same loginId matching Player rows on two different rosters/leagues grants access to both", async () => {
    const { user, player: playerA } = await createMatchedUserAndPlayer("Alice");
    const league2 = await createFixtureLeague();
    const admin2 = await createFixtureAdmin();
    const { players: league2Players } = await createFixtureRoster(league2.id, admin2.id, ["Alice Again"]);
    await prisma.player.update({ where: { id: league2Players[0].id }, data: { loginId: "alice" } });

    await expect(assertOwnsPlayer(user.id, playerA.id)).resolves.toBeTruthy();
    await expect(assertOwnsPlayer(user.id, league2Players[0].id)).resolves.toBeTruthy();
  });

  it("throws the same message for 'not found' and 'found but not mine', to avoid id enumeration", async () => {
    const { user } = await createMatchedUserAndPlayer("Alice");
    let notFoundMessage = "";
    let notMineMessage = "";
    try {
      await assertOwnsPlayer(user.id, "does-not-exist");
    } catch (e) {
      notFoundMessage = (e as Error).message;
    }
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { players } = await createFixtureRoster(league.id, admin.id, ["Bob"]);
    await prisma.player.update({ where: { id: players[0].id }, data: { loginId: "bob" } });
    try {
      await assertOwnsPlayer(user.id, players[0].id);
    } catch (e) {
      notMineMessage = (e as Error).message;
    }
    expect(notFoundMessage).toBe(notMineMessage);
    expect(notFoundMessage).not.toBe("");
  });
});
const AuthErrorMessage = /don't have access/i;

describe("updatePlayerPhotoSelf / removePlayerPhotoSelf", () => {
  it("rejects when both a file and a URL are given", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await expect(
      updatePlayerPhotoSelf(user.id, player.id, { file: tinyJpegFile(), photoUrl: "https://example.com/a.jpg" })
    ).rejects.toThrow(/not both/i);
  });

  it("rejects when neither a file nor a URL is given", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await expect(updatePlayerPhotoSelf(user.id, player.id, {})).rejects.toThrow(/provide a photo/i);
  });

  it("rejects a file over 300KB", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await expect(
      updatePlayerPhotoSelf(user.id, player.id, { file: tinyJpegFile(300 * 1024 + 1) })
    ).rejects.toThrow(/300KB/i);
  });

  it("rejects a disallowed MIME type", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await expect(
      updatePlayerPhotoSelf(user.id, player.id, { file: { type: "image/gif", data: Buffer.alloc(10, 1) } })
    ).rejects.toThrow(/JPG or PNG/i);
  });

  it("rejects an invalid photo URL", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await expect(updatePlayerPhotoSelf(user.id, player.id, { photoUrl: "not a url" })).rejects.toThrow(
      /valid URL/i
    );
  });

  it("rejects a Player the caller doesn't own", async () => {
    const { user } = await createMatchedUserAndPlayer("Alice");
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { players } = await createFixtureRoster(league.id, admin.id, ["Bob"]);
    await prisma.player.update({ where: { id: players[0].id }, data: { loginId: "bob" } });
    await expect(
      updatePlayerPhotoSelf(user.id, players[0].id, { file: tinyJpegFile() })
    ).rejects.toThrow(AuthErrorMessage);
  });

  it("succeeds via file upload, points photoUrl at the serving route, and audits PLAYER_PHOTO_UPDATED_SELF", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await updatePlayerPhotoSelf(user.id, player.id, { file: tinyJpegFile(1234) });

    const updated = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.photoUrl).toBe(`/api/players/${player.id}/photo`);
    expect(updated.linkedUserId).toBeNull();

    const stored = await prisma.playerPhoto.findUnique({ where: { playerId: player.id } });
    expect(stored?.mimeType).toBe("image/jpeg");
    expect(stored?.data).not.toBeNull();

    const log = await expectAuditLog({
      entityType: "Player",
      entityId: player.id,
      action: "PLAYER_PHOTO_UPDATED_SELF",
      actorUserId: user.id,
    });
    expect(JSON.stringify(log.after)).not.toContain("data");
  });

  it("succeeds via URL, and switching from a prior upload clears the stored bytes", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await updatePlayerPhotoSelf(user.id, player.id, { file: tinyJpegFile(1234) });

    await updatePlayerPhotoSelf(user.id, player.id, { photoUrl: "https://example.com/a.jpg" });

    const updated = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.photoUrl).toBe("https://example.com/a.jpg");
    const stored = await prisma.playerPhoto.findUnique({ where: { playerId: player.id } });
    expect(stored).toBeNull();
  });

  it("uploading directly clears an existing live link", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await updateUserProfilePhoto(user.id, { file: tinyJpegFile(50) });
    await linkPlayerPhotoToProfile(user.id, player.id);

    await updatePlayerPhotoSelf(user.id, player.id, { photoUrl: "https://example.com/a.jpg" });

    const updated = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.linkedUserId).toBeNull();
    expect(updated.photoUrl).toBe("https://example.com/a.jpg");
  });

  it("removePlayerPhotoSelf clears the photo and audits PLAYER_PHOTO_REMOVED_SELF", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await updatePlayerPhotoSelf(user.id, player.id, { photoUrl: "https://example.com/a.jpg" });

    await removePlayerPhotoSelf(user.id, player.id);

    const after = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.photoUrl).toBeNull();
    expect(after.linkedUserId).toBeNull();
    await expectAuditLog({
      entityType: "Player",
      entityId: player.id,
      action: "PLAYER_PHOTO_REMOVED_SELF",
      actorUserId: user.id,
    });
  });

  it("removePlayerPhotoSelf is a no-op (no audit row) when there is no photo to remove", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await removePlayerPhotoSelf(user.id, player.id);
    await expectNoAuditLog({ entityType: "Player", action: "PLAYER_PHOTO_REMOVED_SELF" });
  });
});

describe("live-linked photo resolution", () => {
  it("resolves the linked account's current photo, not a stale copy", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await updateUserProfilePhoto(user.id, { file: tinyJpegFile(11) });
    await linkPlayerPhotoToProfile(user.id, player.id);

    const first = await getResolvedPlayerPhoto(player.id);
    expect(first.kind).toBe("bytes");
    if (first.kind !== "bytes") throw new Error("expected bytes");
    expect(first.live).toBe(true);
    expect(first.data.length).toBe(11);

    // The core "live, not copied" requirement: changing the linked
    // account's photo after linking must show up on the very next
    // resolution of the SAME, unchanged Player row.
    await updateUserProfilePhoto(user.id, { file: tinyJpegFile(22) });
    const second = await getResolvedPlayerPhoto(player.id);
    if (second.kind !== "bytes") throw new Error("expected bytes");
    expect(second.data.length).toBe(22);
  });

  it("resolves to a redirect when the linked account uses a URL photo", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await updateUserProfilePhoto(user.id, { photoUrl: "https://example.com/a.jpg" });
    await linkPlayerPhotoToProfile(user.id, player.id);

    const resolved = await getResolvedPlayerPhoto(player.id);
    expect(resolved).toEqual({ kind: "redirect", url: "https://example.com/a.jpg" });
  });

  it("resolves to none if the linked account's photo is removed, even though the link remains", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await updateUserProfilePhoto(user.id, { file: tinyJpegFile(11) });
    await linkPlayerPhotoToProfile(user.id, player.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { photoUrl: null, photoMimeType: null, photoData: null },
    });

    const resolved = await getResolvedPlayerPhoto(player.id);
    expect(resolved).toEqual({ kind: "none" });
    const stillLinked = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(stillLinked.linkedUserId).toBe(user.id);
  });
});

describe("linkPlayerPhotoToProfile / linkPlayerPhotosToProfile", () => {
  it("rejects if the caller has no account photo set", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await expect(linkPlayerPhotoToProfile(user.id, player.id)).rejects.toThrow(/profile picture/i);
  });

  it("bulk link only links players the caller actually owns, silently skipping the rest", async () => {
    const { user, player: ownPlayer } = await createMatchedUserAndPlayer("Alice");
    await updateUserProfilePhoto(user.id, { file: tinyJpegFile(11) });

    const league2 = await createFixtureLeague();
    const admin2 = await createFixtureAdmin();
    const { players: strangerPlayers } = await createFixtureRoster(league2.id, admin2.id, ["Stranger"]);
    await prisma.player.update({ where: { id: strangerPlayers[0].id }, data: { loginId: "not-alice" } });

    await linkPlayerPhotosToProfile(user.id, [ownPlayer.id, strangerPlayers[0].id]);

    const own = await prisma.player.findUniqueOrThrow({ where: { id: ownPlayer.id } });
    expect(own.linkedUserId).toBe(user.id);
    const stranger = await prisma.player.findUniqueOrThrow({ where: { id: strangerPlayers[0].id } });
    expect(stranger.linkedUserId).toBeNull();
  });

  it("linking clears any pre-existing independently-uploaded photo", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await updatePlayerPhotoSelf(user.id, player.id, { file: tinyJpegFile(5) });
    await updateUserProfilePhoto(user.id, { file: tinyJpegFile(11) });

    await linkPlayerPhotoToProfile(user.id, player.id);

    const stored = await prisma.playerPhoto.findUnique({ where: { playerId: player.id } });
    expect(stored).toBeNull();
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.linkedUserId).toBe(user.id);
  });
});

describe("admin updatePlayer's link side effects", () => {
  it("clears an existing link and audits PLAYER_PHOTO_UNLINKED_BY_ADMIN when an admin sets a new photoUrl", async () => {
    const { user, player, admin } = await createMatchedUserAndPlayer();
    await updateUserProfilePhoto(user.id, { file: tinyJpegFile(11) });
    await linkPlayerPhotoToProfile(user.id, player.id);

    await updatePlayer(
      player.id,
      { name: player.name, photoUrl: "https://example.com/admin-set.jpg" },
      admin.id
    );

    const updated = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.linkedUserId).toBeNull();
    expect(updated.photoUrl).toBe("https://example.com/admin-set.jpg");

    const log = await expectAuditLog({
      entityType: "Player",
      entityId: player.id,
      action: "PLAYER_PHOTO_UNLINKED_BY_ADMIN",
      actorUserId: admin.id,
    });
    expect(log.before).toMatchObject({ linkedUserId: user.id });
  });

  it("leaves an existing link untouched, with no audit row, when photoUrl is left blank", async () => {
    const { user, player, admin } = await createMatchedUserAndPlayer();
    await updateUserProfilePhoto(user.id, { file: tinyJpegFile(11) });
    await linkPlayerPhotoToProfile(user.id, player.id);

    await updatePlayer(player.id, { name: "Renamed Only" }, admin.id);

    const updated = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.linkedUserId).toBe(user.id);
    await expectNoAuditLog({ entityType: "Player", action: "PLAYER_PHOTO_UNLINKED_BY_ADMIN" });
  });

  it("deletes a stray independent PlayerPhoto row when an admin sets a new photoUrl", async () => {
    const { user, player, admin } = await createMatchedUserAndPlayer();
    await updatePlayerPhotoSelf(user.id, player.id, { file: tinyJpegFile(5) });

    await updatePlayer(player.id, { name: player.name, photoUrl: "https://example.com/x.jpg" }, admin.id);

    const stored = await prisma.playerPhoto.findUnique({ where: { playerId: player.id } });
    expect(stored).toBeNull();
  });
});

describe("deleteUser cleans up linked Player photos", () => {
  it("nulls both linkedUserId and photoUrl on every Player linked to the deleted account", async () => {
    const { user, player } = await createMatchedUserAndPlayer();
    await updateUserProfilePhoto(user.id, { file: tinyJpegFile(11) });
    await linkPlayerPhotoToProfile(user.id, player.id);
    const otherAdmin = await createFixtureAdmin();

    await deleteUser(user.id, otherAdmin.id);

    const after = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.linkedUserId).toBeNull();
    expect(after.photoUrl).toBeNull();
  });

  it("does not touch an unrelated Player's independently-uploaded photo", async () => {
    const { user: userA } = await createMatchedUserAndPlayer("Alice");
    const { user: userB, player: playerB } = await createMatchedUserAndPlayer("Bob");
    await updatePlayerPhotoSelf(userB.id, playerB.id, { file: tinyJpegFile(5) });
    const otherAdmin = await createFixtureAdmin();

    await deleteUser(userA.id, otherAdmin.id);

    const stillThere = await prisma.player.findUniqueOrThrow({ where: { id: playerB.id } });
    expect(stillThere.photoUrl).toBe(`/api/players/${playerB.id}/photo`);
    const stored = await prisma.playerPhoto.findUnique({ where: { playerId: playerB.id } });
    expect(stored).not.toBeNull();
  });
});
