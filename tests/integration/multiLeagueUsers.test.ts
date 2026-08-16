import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import {
  createFixtureLeague,
  createFixtureAdmin,
  createFixtureRoster,
  createFixtureUserWithMembership,
} from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import {
  resolveLoginIdStatus,
  registerSelf,
  joinLeagueWithExistingLogin,
} from "@/lib/services/selfRegistration.service";
import {
  findPersonByIdentifier,
  deleteMembership,
  setMembershipActive,
} from "@/lib/services/user.service";
import { updateLeagueSettings } from "@/lib/services/league.service";

beforeEach(resetDb);

async function setPlayerLoginId(rosterId: string, playerName: string, loginId: string) {
  const player = await prisma.player.findFirstOrThrow({ where: { rosterId, name: playerName } });
  await prisma.player.update({ where: { id: player.id }, data: { loginId } });
  return player;
}

describe("resolveLoginIdStatus", () => {
  it("is 'new' for an unknown loginId and 'existing' for a known one (case-insensitive)", async () => {
    expect(await resolveLoginIdStatus("nobody@example.com")).toBe("new");

    const admin = await createFixtureAdmin();
    expect(await resolveLoginIdStatus(admin.loginId.toUpperCase())).toBe("existing");
  });
});

describe("registerSelf", () => {
  async function buildFixture() {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { roster } = await createFixtureRoster(league.id, admin.id, ["Alice Player"]);
    await setPlayerLoginId(roster.id, "Alice Player", "alice");
    return { league, roster };
  }

  it("creates a User + one pending LeagueMembership, both inactive until approval", async () => {
    const { league } = await buildFixture();

    const user = await registerSelf({
      leagueId: league.id,
      loginId: "alice",
      password: "password123",
      confirmPassword: "password123",
    });

    expect(user.isActive).toBe(false);
    const membership = await prisma.leagueMembership.findUniqueOrThrow({
      where: { userId_leagueId: { userId: user.id, leagueId: league.id } },
    });
    expect(membership.role).toBe("VIEWER");
    expect(membership.isActive).toBe(false);
  });

  it("rejects a short password, a mismatched confirmation, an invalid league, and a duplicate loginId", async () => {
    const { league } = await buildFixture();

    await expect(
      registerSelf({ leagueId: league.id, loginId: "alice", password: "short", confirmPassword: "short" })
    ).rejects.toThrow("short-password");

    await expect(
      registerSelf({
        leagueId: league.id,
        loginId: "alice",
        password: "password123",
        confirmPassword: "different123",
      })
    ).rejects.toThrow("password-mismatch");

    await expect(
      registerSelf({
        leagueId: "does-not-exist",
        loginId: "alice",
        password: "password123",
        confirmPassword: "password123",
      })
    ).rejects.toThrow("invalid-league");

    await registerSelf({
      leagueId: league.id,
      loginId: "alice",
      password: "password123",
      confirmPassword: "password123",
    });
    await expect(
      registerSelf({
        leagueId: league.id,
        loginId: "alice",
        password: "password123",
        confirmPassword: "password123",
      })
    ).rejects.toThrow("already-registered");
  });

  it("rejects a loginId with no matching player on this league's roster", async () => {
    const { league } = await buildFixture();
    await expect(
      registerSelf({
        leagueId: league.id,
        loginId: "nobody-on-roster",
        password: "password123",
        confirmPassword: "password123",
      })
    ).rejects.toThrow("player-not-found");
  });
});

describe("joinLeagueWithExistingLogin", () => {
  async function buildFixture() {
    const leagueA = await createFixtureLeague();
    const leagueB = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { roster: rosterB } = await createFixtureRoster(leagueB.id, admin.id, ["Bob Player"]);
    const { user, password } = await createFixtureUserWithMembership(leagueA.id, "VIEWER");
    await setPlayerLoginId(rosterB.id, "Bob Player", user.loginId);
    return { leagueA, leagueB, user, password };
  }

  it("adds a second pending LeagueMembership without creating a second User", async () => {
    const { leagueB, user, password } = await buildFixture();

    const membership = await joinLeagueWithExistingLogin({
      leagueId: leagueB.id,
      loginId: user.loginId,
      password,
    });

    expect(membership.userId).toBe(user.id);
    expect(membership.isActive).toBe(false);
    const allUsersWithThisLoginId = await prisma.user.count({ where: { loginId: user.loginId } });
    expect(allUsersWithThisLoginId).toBe(1);
  });

  it("rejects a wrong password, an unknown loginId, and an already-existing membership", async () => {
    const { leagueA, leagueB, user, password } = await buildFixture();

    await expect(
      joinLeagueWithExistingLogin({ leagueId: leagueB.id, loginId: user.loginId, password: "wrong" })
    ).rejects.toThrow("wrong-password");

    await expect(
      joinLeagueWithExistingLogin({ leagueId: leagueB.id, loginId: "nobody", password })
    ).rejects.toThrow("account-not-found");

    await expect(
      joinLeagueWithExistingLogin({ leagueId: leagueA.id, loginId: user.loginId, password })
    ).rejects.toThrow("already-member");
  });

  it("rejects when the account is not yet active (still pending its first-ever approval)", async () => {
    const leagueA = await createFixtureLeague();
    const leagueB = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { roster: rosterB } = await createFixtureRoster(leagueB.id, admin.id, ["Cara Player"]);
    const { user, password } = await createFixtureUserWithMembership(leagueA.id, "VIEWER", {
      isActive: false,
      membershipActive: false,
    });
    await setPlayerLoginId(rosterB.id, "Cara Player", user.loginId);

    await expect(
      joinLeagueWithExistingLogin({ leagueId: leagueB.id, loginId: user.loginId, password })
    ).rejects.toThrow("account-disabled");
  });

  it("rejects when there's no matching player on the new league's roster", async () => {
    const leagueA = await createFixtureLeague();
    const leagueB = await createFixtureLeague();
    const { user, password } = await createFixtureUserWithMembership(leagueA.id, "VIEWER");

    await expect(
      joinLeagueWithExistingLogin({ leagueId: leagueB.id, loginId: user.loginId, password })
    ).rejects.toThrow("player-not-found");
  });
});

describe("findPersonByIdentifier", () => {
  it("finds by loginId (case-insensitive), by email, and by phone; null when nothing matches", async () => {
    const league = await createFixtureLeague();
    const { user } = await createFixtureUserWithMembership(league.id, "VIEWER");
    await prisma.user.update({
      where: { id: user.id },
      data: { email: "person@example.com", phone: "555-1234" },
    });

    expect((await findPersonByIdentifier(user.loginId.toUpperCase()))?.id).toBe(user.id);
    expect((await findPersonByIdentifier("person@example.com"))?.id).toBe(user.id);
    expect((await findPersonByIdentifier("555-1234"))?.id).toBe(user.id);
    expect(await findPersonByIdentifier("no-such-identifier")).toBeNull();
  });
});

describe("deleteMembership", () => {
  it("removes only the target membership, leaving the account and other memberships intact", async () => {
    const leagueA = await createFixtureLeague();
    const leagueB = await createFixtureLeague();
    const { user } = await createFixtureUserWithMembership(leagueA.id, "VIEWER");
    const membershipB = await prisma.leagueMembership.create({
      data: { userId: user.id, leagueId: leagueB.id, role: "VIEWER", isActive: true },
    });
    const admin = await createFixtureAdmin();

    await deleteMembership(membershipB.id, admin.id);

    const remaining = await prisma.leagueMembership.findMany({ where: { userId: user.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].leagueId).toBe(leagueA.id);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it("blocks removing your own membership and a membership in a read-only league", async () => {
    const league = await createFixtureLeague();
    const { user, membership } = await createFixtureUserWithMembership(league.id, "VIEWER");

    await expect(deleteMembership(membership.id, user.id)).rejects.toThrow(/own access/);

    const admin = await createFixtureAdmin();
    await updateLeagueSettings(league.id, { endDate: new Date(Date.now() - 86_400_000) });
    await expect(deleteMembership(membership.id, admin.id)).rejects.toThrow(/read-only/);
  });

  it("blocks removal when the person created resources in that league", async () => {
    const league = await createFixtureLeague();
    const { user, membership } = await createFixtureUserWithMembership(league.id, "TEAM_MANAGER");
    const admin = await createFixtureAdmin();
    await createFixtureRoster(league.id, user.id, ["Someone"]);

    await expect(deleteMembership(membership.id, admin.id)).rejects.toThrow(/roster/);
  });
});

describe("setMembershipActive", () => {
  it("approving a person's first-ever membership also activates their account", async () => {
    const league = await createFixtureLeague();
    const { user, membership } = await createFixtureUserWithMembership(league.id, "VIEWER", {
      isActive: false,
      membershipActive: false,
    });
    const admin = await createFixtureAdmin();

    await setMembershipActive(membership.id, admin.id, true);

    const updatedMembership = await prisma.leagueMembership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedMembership.isActive).toBe(true);
    expect(updatedUser.isActive).toBe(true);
  });

  it("revoking one membership never touches the account or other memberships", async () => {
    const leagueA = await createFixtureLeague();
    const leagueB = await createFixtureLeague();
    const { user, membership: membershipA } = await createFixtureUserWithMembership(
      leagueA.id,
      "VIEWER"
    );
    const membershipB = await prisma.leagueMembership.create({
      data: { userId: user.id, leagueId: leagueB.id, role: "VIEWER", isActive: true },
    });
    const admin = await createFixtureAdmin();

    await setMembershipActive(membershipB.id, admin.id, false);

    expect(
      (await prisma.leagueMembership.findUniqueOrThrow({ where: { id: membershipB.id } })).isActive
    ).toBe(false);
    expect(
      (await prisma.leagueMembership.findUniqueOrThrow({ where: { id: membershipA.id } })).isActive
    ).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(true);
  });

  it("blocks disabling your own access", async () => {
    const league = await createFixtureLeague();
    const { user, membership } = await createFixtureUserWithMembership(league.id, "VIEWER");
    await expect(setMembershipActive(membership.id, user.id, false)).rejects.toThrow(/own access/);
  });
});
