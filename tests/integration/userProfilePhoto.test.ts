import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureAdmin } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import {
  updateUserProfilePhoto,
  removeUserProfilePhoto,
  getUserPhotoContent,
} from "@/lib/services/user.service";
import { expectAuditLog, expectNoAuditLog } from "../helpers/auditLog";

beforeEach(resetDb);

const tinyJpegFile = (sizeBytes = 10) => ({
  type: "image/jpeg",
  data: Buffer.alloc(sizeBytes, 1),
});

describe("updateUserProfilePhoto", () => {
  it("rejects when both a file and a URL are given", async () => {
    const admin = await createFixtureAdmin();
    await expect(
      updateUserProfilePhoto(admin.id, { file: tinyJpegFile(), photoUrl: "https://example.com/a.jpg" })
    ).rejects.toThrow(/not both/i);
  });

  it("rejects when neither a file nor a URL is given", async () => {
    const admin = await createFixtureAdmin();
    await expect(updateUserProfilePhoto(admin.id, {})).rejects.toThrow(/provide a photo/i);
  });

  it("rejects a file over 300KB", async () => {
    const admin = await createFixtureAdmin();
    await expect(
      updateUserProfilePhoto(admin.id, { file: tinyJpegFile(300 * 1024 + 1) })
    ).rejects.toThrow(/300KB/i);
  });

  it("accepts a file at exactly 300KB", async () => {
    const admin = await createFixtureAdmin();
    const updated = await updateUserProfilePhoto(admin.id, { file: tinyJpegFile(300 * 1024) });
    expect(updated.photoMimeType).toBe("image/jpeg");
  });

  it("rejects a disallowed MIME type", async () => {
    const admin = await createFixtureAdmin();
    await expect(
      updateUserProfilePhoto(admin.id, { file: { type: "image/gif", data: Buffer.alloc(10, 1) } })
    ).rejects.toThrow(/JPG or PNG/i);
  });

  it("rejects an invalid photo URL", async () => {
    const admin = await createFixtureAdmin();
    await expect(
      updateUserProfilePhoto(admin.id, { photoUrl: "not a url" })
    ).rejects.toThrow(/valid URL/i);
  });

  it("succeeds via file upload, storing bytes and auditing PROFILE_UPDATED_SELF", async () => {
    const admin = await createFixtureAdmin();
    const updated = await updateUserProfilePhoto(admin.id, { file: tinyJpegFile(1234) });
    expect(updated.photoUrl).toBeNull();
    expect(updated.photoMimeType).toBe("image/jpeg");
    expect(updated.photoData).not.toBeNull();

    const log = await expectAuditLog({
      entityType: "User",
      entityId: admin.id,
      action: "PROFILE_UPDATED_SELF",
      actorUserId: admin.id,
    });
    // Never snapshot raw photo bytes into the audit trail.
    expect(JSON.stringify(log.after)).not.toContain("photoData");
    expect(log.after).toMatchObject({ hadUploadedPhoto: true });
  });

  it("succeeds via URL, and switching from a prior upload clears the stored bytes", async () => {
    const admin = await createFixtureAdmin();
    await updateUserProfilePhoto(admin.id, { file: tinyJpegFile(1234) });

    const updated = await updateUserProfilePhoto(admin.id, { photoUrl: "https://example.com/a.jpg" });
    expect(updated.photoUrl).toBe("https://example.com/a.jpg");
    expect(updated.photoMimeType).toBeNull();
    expect(updated.photoData).toBeNull();
  });

  it("getUserPhotoContent returns the stored bytes and mime type", async () => {
    const admin = await createFixtureAdmin();
    await updateUserProfilePhoto(admin.id, { file: tinyJpegFile(42) });
    const content = await getUserPhotoContent(admin.id);
    expect(content?.photoMimeType).toBe("image/jpeg");
    expect(content?.photoData).not.toBeNull();
  });
});

describe("removeUserProfilePhoto", () => {
  it("clears the photo and audits PROFILE_UPDATED_SELF", async () => {
    const admin = await createFixtureAdmin();
    await updateUserProfilePhoto(admin.id, { photoUrl: "https://example.com/a.jpg" });

    await removeUserProfilePhoto(admin.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(after.photoUrl).toBeNull();
    expect(after.photoMimeType).toBeNull();
    expect(after.photoData).toBeNull();

    const logs = await prisma.auditLog.findMany({
      where: { entityType: "User", entityId: admin.id, action: "PROFILE_UPDATED_SELF" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.length).toBe(2); // one for the initial set, one for the removal
    expect(logs[1].after).toMatchObject({ photoUrl: null, hadUploadedPhoto: false });
  });

  it("is a no-op (no audit row) when there is no photo to remove", async () => {
    const admin = await createFixtureAdmin();
    await removeUserProfilePhoto(admin.id);
    await expectNoAuditLog({ entityType: "User", action: "PROFILE_UPDATED_SELF" });
  });
});
