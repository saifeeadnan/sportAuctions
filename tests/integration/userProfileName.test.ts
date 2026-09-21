import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureLeague, createFixtureUserWithMembership } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { updateUserProfile } from "@/lib/services/user.service";

beforeEach(resetDb);

async function makeUser() {
  const { user } = await createFixtureUserWithMembership((await createFixtureLeague()).id, "VIEWER");
  return user;
}

describe("updateUserProfile — name", () => {
  it("updates the single name column from first + last, and audits the before/after name", async () => {
    const user = await makeUser();

    await updateUserProfile(user.id, { email: "", phone: "", firstName: "Adnan", lastName: "Saifee" });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.name).toBe("Adnan Saifee");

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "User", entityId: user.id, action: "PROFILE_UPDATED_SELF" },
    });
    expect((log.before as { name?: string })?.name).toBe(user.name);
    expect((log.after as { name?: string })?.name).toBe("Adnan Saifee");
  });

  it("accepts a first name alone (no last name)", async () => {
    const user = await makeUser();
    await updateUserProfile(user.id, { email: "", phone: "", firstName: "Cher", lastName: "" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("Cher");
  });

  it("leaves the name and its audit fields alone when the form is re-saved unchanged", async () => {
    const user = await makeUser();
    await updateUserProfile(user.id, { email: "", phone: "", firstName: "Adnan", lastName: "Saifee" });
    await prisma.auditLog.deleteMany({ where: { entityType: "User", entityId: user.id } });

    await updateUserProfile(user.id, { email: "a@example.com", phone: "", firstName: "Adnan", lastName: "Saifee" });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "User", entityId: user.id, action: "PROFILE_UPDATED_SELF" },
    });
    expect(log.before).not.toHaveProperty("name");
    expect(log.after).not.toHaveProperty("name");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("Adnan Saifee");
  });

  it("never touches the name when no firstName is passed (mobile/admin callers)", async () => {
    const user = await makeUser();
    await updateUserProfile(user.id, { email: "b@example.com", phone: "" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(user.name);
  });

  it("rejects an empty first name and writes nothing, not even the email", async () => {
    const user = await makeUser();

    await expect(
      updateUserProfile(user.id, { email: "c@example.com", phone: "", firstName: "  ", lastName: "Saifee" })
    ).rejects.toThrow("name-required");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.name).toBe(user.name);
    expect(after.email).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityType: "User", entityId: user.id } })).toBe(0);
  });

  it("rejects an over-long name part", async () => {
    const user = await makeUser();
    await expect(
      updateUserProfile(user.id, { email: "", phone: "", firstName: "a".repeat(61), lastName: "" })
    ).rejects.toThrow("name-too-long");
  });

  it("does not change the user's loginId, so login and roster linking are unaffected", async () => {
    const user = await makeUser();
    await updateUserProfile(user.id, { email: "", phone: "", firstName: "New", lastName: "Name" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).loginId).toBe(user.loginId);
  });
});
