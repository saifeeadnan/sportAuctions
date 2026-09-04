import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";

export type RegisterSelfInput = {
  leagueId: string;
  loginId: string;
  password: string;
  confirmPassword: string;
};

export type JoinLeagueWithExistingLoginInput = {
  leagueId: string;
  loginId: string;
  password: string;
};

/**
 * Whether a `loginId` already belongs to an account — the step-1 check that
 * decides which form `/register` shows next: "choose a password" for a new
 * person, or "enter your existing password" for someone re-associating an
 * existing login with another league.
 */
export async function resolveLoginIdStatus(loginId: string): Promise<"new" | "existing"> {
  const trimmed = loginId.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { loginId: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  return existing ? "existing" : "new";
}

/**
 * Self-service registration for a brand-new person. Always creates a VIEWER
 * membership, matched to an existing Player row (so fantasy-team eligibility
 * and the roster self-lock feature work immediately), and both the account
 * and the membership start inactive until a League Admin approves — mirrors
 * the login/session guarantees already enforced for disabled accounts in
 * auth.ts, not new logic. (Once approved, a *second* league added via
 * `joinLeagueWithExistingLogin` below does NOT re-block the account — only
 * this very first approval gates login at all.)
 */
export async function registerSelf(input: RegisterSelfInput) {
  const loginId = input.loginId.trim().toLowerCase();
  if (!loginId) throw new ValidationError("missing-login-id");
  if (input.password.length < 8) throw new ValidationError("short-password");
  if (input.password !== input.confirmPassword) throw new ValidationError("password-mismatch");

  const league = await prisma.league.findUnique({ where: { id: input.leagueId } });
  if (!league) throw new ValidationError("invalid-league");

  const existingUser = await prisma.user.findFirst({
    where: { loginId: { equals: loginId, mode: "insensitive" } },
  });
  if (existingUser) throw new ValidationError("already-registered");

  const player = await prisma.player.findFirst({
    where: {
      loginId: { equals: loginId, mode: "insensitive" },
      roster: { leagueId: league.id },
    },
  });
  if (!player) throw new ValidationError("player-not-found");

  const passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        loginId,
        name: player.name,
        passwordHash,
        isActive: false,
        memberships: {
          create: { leagueId: league.id, role: "VIEWER", isActive: false },
        },
      },
    });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: user.id,
      action: "USER_REGISTERED",
      actorUserId: user.id,
      after: { loginId, leagueName: league.name },
      note: "Self-registered",
    });
    return user;
  });
}

/**
 * A returning person (already has a login, from another league) adding this
 * league to their existing account. Proves ownership with their real
 * password rather than letting anyone claim an existing loginId — never
 * creates a second User, only a new (pending) LeagueMembership. Requires the
 * account to already be active (approved at least once already) — a
 * not-yet-approved account can't self-service its way into a second league
 * ahead of its first.
 */
export async function joinLeagueWithExistingLogin(input: JoinLeagueWithExistingLoginInput) {
  const loginId = input.loginId.trim().toLowerCase();
  if (!loginId) throw new ValidationError("missing-login-id");
  if (!input.password) throw new ValidationError("missing-fields");

  const league = await prisma.league.findUnique({ where: { id: input.leagueId } });
  if (!league) throw new ValidationError("invalid-league");

  const user = await prisma.user.findFirst({
    where: { loginId: { equals: loginId, mode: "insensitive" } },
  });
  if (!user) throw new ValidationError("account-not-found");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new ValidationError("wrong-password");

  if (!user.isActive) throw new ValidationError("account-disabled");

  const existingMembership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId: league.id } },
  });
  if (existingMembership) throw new ValidationError("already-member");

  const player = await prisma.player.findFirst({
    where: {
      loginId: { equals: loginId, mode: "insensitive" },
      roster: { leagueId: league.id },
    },
  });
  if (!player) throw new ValidationError("player-not-found");

  return prisma.$transaction(async (tx) => {
    const membership = await tx.leagueMembership.create({
      data: { userId: user.id, leagueId: league.id, role: "VIEWER", isActive: false },
    });
    await writeAuditLog(tx, {
      entityType: "LeagueMembership",
      entityId: membership.id,
      action: "MEMBERSHIP_ADDED",
      actorUserId: user.id,
      after: { role: "VIEWER", leagueName: league.name },
      note: "Self-joined via existing login",
    });
    return membership;
  });
}
