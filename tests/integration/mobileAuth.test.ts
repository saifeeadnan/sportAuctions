import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureLeague, createFixtureAdmin } from "../helpers/fixtures";

// Same reasoning as authScope.test.ts: lib/auth/guards.ts imports the real
// "@/auth", which pulls in a next/server import chain that doesn't resolve
// under Vitest's plain Node environment. Both mocks are controlled per test
// below (auth() resolves null to simulate "no cookie"; headers() resolves
// whatever Authorization header each test wants to exercise).
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

const { auth } = await import("@/auth");
const { headers } = await import("next/headers");
const { requireSession, requireRole, AuthError } = await import("@/lib/auth/guards");
const { encodeMobileToken } = await import("@/lib/auth/mobileToken");

beforeEach(resetDb);

function mockNoCookieSession() {
  vi.mocked(auth).mockResolvedValue(null as never);
}

function mockAuthorizationHeader(value: string | null) {
  const h = new Headers();
  if (value != null) h.set("authorization", value);
  vi.mocked(headers).mockResolvedValue(h as never);
}

describe("requireSession bearer-token fallback", () => {
  it("resolves a session identical in shape to the cookie path from a valid bearer token", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();

    const token = await encodeMobileToken({
      id: admin.id,
      name: admin.name,
      isSiteAdmin: admin.isSiteAdmin,
      memberships: [{ leagueId: league.id, role: "LEAGUE_ADMIN" }],
      analyticsSessionId: "session-1",
    });

    mockNoCookieSession();
    mockAuthorizationHeader(`Bearer ${token}`);

    const session = await requireSession();
    expect(session.user.id).toBe(admin.id);
    expect(session.user.memberships).toEqual([{ leagueId: league.id, role: "LEAGUE_ADMIN" }]);
  });

  it("requireRole works identically against a bearer-token session", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const token = await encodeMobileToken({
      id: admin.id,
      name: admin.name,
      isSiteAdmin: false,
      memberships: [{ leagueId: league.id, role: "TEAM_MANAGER" }],
      analyticsSessionId: "session-1",
    });

    mockNoCookieSession();
    mockAuthorizationHeader(`Bearer ${token}`);

    await expect(requireRole("TEAM_MANAGER")).resolves.toBeTruthy();
    await expect(requireRole("AUCTIONEER")).rejects.toThrow(AuthError);
  });

  it("rejects with no cookie and no Authorization header", async () => {
    mockNoCookieSession();
    mockAuthorizationHeader(null);

    await expect(requireSession()).rejects.toThrow(AuthError);
  });

  it("rejects a garbage bearer token", async () => {
    mockNoCookieSession();
    mockAuthorizationHeader("Bearer not-a-real-token");

    await expect(requireSession()).rejects.toThrow(AuthError);
  });

  it("ignores a non-Bearer Authorization header", async () => {
    mockNoCookieSession();
    mockAuthorizationHeader("Basic dXNlcjpwYXNz");

    await expect(requireSession()).rejects.toThrow(AuthError);
  });
});
