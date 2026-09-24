import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureLeague, createFixtureUserWithMembership } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";

// lib/auth/credentials.ts imports CredentialsSignin from the real "next-auth",
// whose own imports (next/server) don't resolve under Vitest's plain Node
// environment — same class of problem authScope.test.ts works around for
// "@/auth". Only the base class is needed here.
vi.mock("next-auth", () => ({ CredentialsSignin: class CredentialsSignin extends Error {} }));

const { verifyCredentials } = await import("@/lib/auth/credentials");

beforeEach(resetDb);

async function makeUser() {
  const { user } = await createFixtureUserWithMembership((await createFixtureLeague()).id, "VIEWER");
  return user;
}

const requestWith = (headers: Record<string, string>) => new Request("http://localhost/login", { headers });

describe("verifyCredentials — login event", () => {
  it("records the visitor's IP (first hop only) and browser", async () => {
    const user = await makeUser();

    await verifyCredentials(
      user.loginId,
      "password123",
      requestWith({ "x-forwarded-for": "203.0.113.7, 172.68.1.1, 10.0.0.2", "user-agent": "TestBrowser/1.0" })
    );

    const event = await prisma.loginEvent.findFirstOrThrow({ where: { userId: user.id } });
    expect(event.ipAddress).toBe("203.0.113.7");
    expect(event.userAgent).toBe("TestBrowser/1.0");
  });

  it("prefers Cloudflare's client-IP header when it's there", async () => {
    const user = await makeUser();

    await verifyCredentials(
      user.loginId,
      "password123",
      requestWith({ "cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "203.0.113.7" })
    );

    expect((await prisma.loginEvent.findFirstOrThrow({ where: { userId: user.id } })).ipAddress).toBe("198.51.100.9");
  });

  it("still logs the user in, with no IP or browser stored, when the request carries neither", async () => {
    const user = await makeUser();

    const verified = await verifyCredentials(user.loginId, "password123", requestWith({}));

    expect(verified?.id).toBe(user.id);
    const event = await prisma.loginEvent.findFirstOrThrow({ where: { userId: user.id } });
    expect(event.ipAddress).toBeNull();
    expect(event.userAgent).toBeNull();
  });
});
