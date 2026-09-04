import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { $Enums } from "@/app/generated/prisma/client";
import { ValidationError } from "@/lib/errors";
import { assertLeagueNotReadOnly } from "@/lib/services/league.service";
import { writeAuditLog } from "@/lib/services/auditLog.service";

/** Finds an existing person by loginId, email, or phone — for the
 * admin-assisted "add an existing person to this league" flow. Exact match
 * (case-insensitive on loginId, matching how login itself resolves it). */
export async function findPersonByIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return null;
  return prisma.user.findFirst({
    where: {
      OR: [
        { loginId: { equals: value, mode: "insensitive" } },
        { email: { equals: value, mode: "insensitive" } },
        { phone: value },
      ],
    },
  });
}

// Now only ever exercised against site-Admin identities (see
// deleteUserAction) — an Admin isn't scoped to any one league, so there's no
// read-only-league check here anymore; that lives on deleteMembership below,
// for the league-scoped roles.
export async function deleteUser(userId: string, requestingUserId: string) {
  if (userId === requestingUserId) {
    throw new ValidationError("You cannot delete your own account while logged in.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          createdRosters: true,
          createdTournaments: true,
          createdAuctions: true,
          managedTeams: true,
        },
      },
    },
  });
  if (!user) throw new ValidationError("User not found");

  const blockers: string[] = [];
  if (user._count.createdRosters > 0) blockers.push(`${user._count.createdRosters} roster(s)`);
  if (user._count.createdTournaments > 0) blockers.push(`${user._count.createdTournaments} tournament(s)`);
  if (user._count.createdAuctions > 0) blockers.push(`${user._count.createdAuctions} auction(s)`);
  if (user._count.managedTeams > 0) blockers.push(`${user._count.managedTeams} team(s) they manage`);

  if (blockers.length > 0) {
    throw new ValidationError(
      `Cannot delete "${user.name}" — they are linked to ${blockers.join(", ")}. Reassign or remove those first.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: userId,
      action: "USER_DELETED",
      actorUserId: requestingUserId,
      before: { loginId: user.loginId, name: user.name },
    });
    await tx.user.delete({ where: { id: userId } });
  });
}

export async function setUserActive(userId: string, requestingUserId: string, isActive: boolean) {
  if (userId === requestingUserId && !isActive) {
    throw new ValidationError("You cannot disable your own account while logged in.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ValidationError("User not found");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: userId,
      action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      actorUserId: requestingUserId,
      before: { isActive: user.isActive },
      after: { isActive },
    });
  });
}

/** Removes a specific league's access for a person — never touches the
 * underlying identity or their other leagues' memberships. */
export async function deleteMembership(membershipId: string, requestingUserId: string) {
  const membership = await prisma.leagueMembership.findUnique({
    where: { id: membershipId },
    include: { league: true, user: true },
  });
  if (!membership) throw new ValidationError("Membership not found");
  if (membership.userId === requestingUserId) {
    throw new ValidationError("You cannot remove your own access while logged in.");
  }
  assertLeagueNotReadOnly(membership.league);

  const { userId, leagueId } = membership;
  const [rosterCount, tournamentCount, auctionCount, teamCount] = await Promise.all([
    prisma.playerRoster.count({ where: { leagueId, createdById: userId } }),
    prisma.tournament.count({ where: { leagueId, createdById: userId } }),
    prisma.auction.count({ where: { tournament: { leagueId }, createdById: userId } }),
    prisma.team.count({ where: { tournament: { leagueId }, managerId: userId } }),
  ]);

  const blockers: string[] = [];
  if (rosterCount > 0) blockers.push(`${rosterCount} roster(s)`);
  if (tournamentCount > 0) blockers.push(`${tournamentCount} tournament(s)`);
  if (auctionCount > 0) blockers.push(`${auctionCount} auction(s)`);
  if (teamCount > 0) blockers.push(`${teamCount} team(s) they manage`);

  if (blockers.length > 0) {
    throw new ValidationError(
      `Cannot remove "${membership.user.name}" from this league — they are linked to ${blockers.join(", ")} in it. Reassign or remove those first.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await writeAuditLog(tx, {
      entityType: "LeagueMembership",
      entityId: membershipId,
      action: "MEMBERSHIP_DELETED",
      actorUserId: requestingUserId,
      before: { loginId: membership.user.loginId, role: membership.role, leagueName: membership.league.name },
    });
    await tx.leagueMembership.delete({ where: { id: membershipId } });
  });
}

/** Approves/revokes a person's access to one specific league. Approving
 * (isActive: false -> true) a person's very first membership anywhere also
 * activates their account — that's the only thing that unblocks login for a
 * brand-new self-registered signup (see selfRegistration.service.ts).
 * Disabling one league's membership never touches the account or their
 * other leagues. */
export async function setMembershipActive(
  membershipId: string,
  requestingUserId: string,
  isActive: boolean
) {
  const membership = await prisma.leagueMembership.findUnique({
    where: { id: membershipId },
    include: { user: true },
  });
  if (!membership) throw new ValidationError("Membership not found");
  if (membership.userId === requestingUserId && !isActive) {
    throw new ValidationError("You cannot disable your own access while logged in.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.leagueMembership.update({ where: { id: membershipId }, data: { isActive } });

    if (isActive && !membership.user.isActive) {
      await tx.user.update({ where: { id: membership.userId }, data: { isActive: true } });
    }

    await writeAuditLog(tx, {
      entityType: "LeagueMembership",
      entityId: membershipId,
      action: isActive ? "MEMBERSHIP_ACTIVATED" : "MEMBERSHIP_DEACTIVATED",
      actorUserId: requestingUserId,
      before: { isActive: membership.isActive },
      after: { isActive },
    });
  });
}

/** Self-service password change, from the profile page. Throws the exact
 * same short ValidationError codes the caller has always translated into a
 * ?error=CODE redirect — only the write + audit log move here, not that
 * presentation logic. See changePasswordWithMessage below for the mobile
 * client's equivalent, which needs full human-readable messages instead. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) {
  if (!currentPassword || !newPassword) throw new ValidationError("missing-fields");
  if (newPassword.length < 8) throw new ValidationError("short");
  if (newPassword !== confirmPassword) throw new ValidationError("mismatch");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ValidationError("wrong-current");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    // Never the hash, in either direction — just the fact that it changed.
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: userId,
      action: "PASSWORD_CHANGED_SELF",
      actorUserId: userId,
    });
  });
}

/** Self-service password change for the mobile client — same
 * current-password verification as changePassword, but throws full
 * human-readable ValidationError messages (this route's existing JSON-API
 * convention, unlike the web form's short redirect codes) and doesn't check
 * password confirmation (the mobile screen already does that client-side). */
export async function changePasswordWithMessage(userId: string, currentPassword: string, newPassword: string) {
  if (!currentPassword || !newPassword) {
    throw new ValidationError("Current and new password are required");
  }
  if (newPassword.length < 8) {
    throw new ValidationError("New password must be at least 8 characters");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ValidationError("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: userId,
      action: "PASSWORD_CHANGED_SELF",
      actorUserId: userId,
    });
  });
}

/** Self-service email/phone update, from the profile page. Both optional,
 * unique-when-provided — rejects saving a value already claimed by a
 * different account rather than silently overwriting the dedupe key. Throws
 * short ValidationError codes; see updateUserProfileWithMessage below for
 * the mobile client's human-readable equivalent. */
export async function updateUserProfile(userId: string, input: { email: string; phone: string }) {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (email) {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, NOT: { id: userId } },
    });
    if (existing) throw new ValidationError("email-taken");
  }
  if (phone) {
    const existing = await prisma.user.findFirst({ where: { phone, NOT: { id: userId } } });
    if (existing) throw new ValidationError("phone-taken");
  }

  const before = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, phone: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { email: email || null, phone: phone || null } });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: userId,
      action: "PROFILE_UPDATED_SELF",
      actorUserId: userId,
      before: { email: before.email, phone: before.phone },
      after: { email: email || null, phone: phone || null },
    });
  });
}

/** Self-service email/phone update for the mobile client — same semantics
 * as updateUserProfile, but throws full human-readable ValidationError
 * messages (this route's existing JSON-API convention) instead of short
 * redirect codes. */
export async function updateUserProfileWithMessage(userId: string, input: { email: string; phone: string }) {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (email) {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, NOT: { id: userId } },
    });
    if (existing) throw new ValidationError("That email is already in use by another account");
  }
  if (phone) {
    const existing = await prisma.user.findFirst({ where: { phone, NOT: { id: userId } } });
    if (existing) throw new ValidationError("That phone number is already in use by another account");
  }

  const before = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, phone: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { email: email || null, phone: phone || null } });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: userId,
      action: "PROFILE_UPDATED_SELF",
      actorUserId: userId,
      before: { email: before.email, phone: before.phone },
      after: { email: email || null, phone: phone || null },
    });
  });
}

/** Site-Admin-only password reset for someone else's account — human-
 * readable ValidationError messages, unlike changePassword's short codes,
 * since resetUserPasswordAction uses the standard toActionResult/ActionResult
 * convention rather than a redirect-code page. */
export async function resetUserPassword(userId: string, newPassword: string, actorUserId: string) {
  if (newPassword.length < 8) throw new ValidationError("Password must be at least 8 characters");

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) throw new ValidationError("User not found");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: userId,
      action: "PASSWORD_RESET_BY_ADMIN",
      actorUserId,
    });
  });
}

/** Admin-facing counterpart to updateUserProfile — lets an admin fix up a
 * person's email/phone on their behalf. Human-readable ValidationError
 * messages, matching adminUpdateProfileAction's plain ActionResult
 * convention (no redirect-code page involved). */
export async function adminUpdateProfile(
  userId: string,
  input: { email: string; phone: string },
  actorUserId: string
) {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (email) {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, NOT: { id: userId } },
    });
    if (existing) throw new ValidationError("That email is already in use by another account");
  }
  if (phone) {
    const existing = await prisma.user.findFirst({ where: { phone, NOT: { id: userId } } });
    if (existing) throw new ValidationError("That phone number is already in use by another account");
  }

  const before = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, phone: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { email: email || null, phone: phone || null } });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: userId,
      action: "PROFILE_UPDATED_BY_ADMIN",
      actorUserId,
      before: { email: before.email, phone: before.phone },
      after: { email: email || null, phone: phone || null },
    });
  });
}

export type AdminCreateUserInput = {
  loginId: string;
  name: string;
  passwordHash: string;
  role: $Enums.Role;
  isSiteAdmin: boolean;
  /** Required unless isSiteAdmin — an Admin identity has no league. */
  targetLeagueId?: string | null;
  managerBasePrice?: number | null;
};

/** Admin/League-Admin-assisted account creation — the actual create() calls
 * moved out of registerUserAction, which keeps its own role-permission and
 * form-field resolution logic (which caller can grant which role, which
 * league a form field vs. the caller's own scope decides) unchanged. */
export async function adminCreateUser(input: AdminCreateUserInput, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const user = input.isSiteAdmin
      ? await tx.user.create({
          data: {
            loginId: input.loginId,
            name: input.name,
            passwordHash: input.passwordHash,
            isSiteAdmin: true,
            isActive: true,
          },
        })
      : await tx.user.create({
          data: {
            loginId: input.loginId,
            name: input.name,
            passwordHash: input.passwordHash,
            isActive: true,
            memberships: {
              create: {
                leagueId: input.targetLeagueId!,
                role: input.role,
                // Admin-added memberships start active immediately — unlike a
                // self-registered signup, no separate approval step needed.
                isActive: true,
                managerBasePrice: input.managerBasePrice ?? null,
              },
            },
          },
        });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: user.id,
      action: "USER_REGISTERED",
      actorUserId,
      after: { loginId: user.loginId, role: input.isSiteAdmin ? "ADMIN" : input.role },
    });
    return user;
  });
}

/** Admin-assisted re-association: adds an existing person directly to a
 * league without them re-registering — the create() call moved out of
 * addExistingPersonAction, which keeps its own role-permission checks and
 * league resolution unchanged. */
export async function adminAddExistingPersonToLeague(
  personId: string,
  leagueId: string,
  role: $Enums.Role,
  actorUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.leagueMembership.create({
      data: { userId: personId, leagueId, role, isActive: true },
    });
    await writeAuditLog(tx, {
      entityType: "LeagueMembership",
      entityId: membership.id,
      action: "MEMBERSHIP_ADDED",
      actorUserId,
      after: { role },
    });
    return membership;
  });
}
