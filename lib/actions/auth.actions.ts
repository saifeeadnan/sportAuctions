"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdminOrLeagueAdmin, AuthError, type Role } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  deleteUser,
  setUserActive,
  deleteMembership,
  setMembershipActive,
  findPersonByIdentifier,
} from "@/lib/services/user.service";
import { assertLeagueNotReadOnly } from "@/lib/services/league.service";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

// The unused prevState param lets this bind into useActionState
// (ActionResultForm) directly as a plain <form action={registerUserAction}>.
export async function registerUserAction(
  _prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  const result = await toActionResult(async () => {
    const { leagueIds: callerLeagueIds } = await requireAdminOrLeagueAdmin();

    const loginId = String(formData.get("loginId") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const role = String(formData.get("role") ?? "") as Role;
    const password = String(formData.get("password") ?? "");
    const managerBasePrice = formData.get("managerBasePrice");

    if (!loginId || !name || !password) {
      throw new ValidationError("Login ID, name, and password are required");
    }
    if (!["ADMIN", "LEAGUE_ADMIN", "TEAM_MANAGER", "AUCTIONEER", "VIEWER"].includes(role)) {
      throw new ValidationError("Invalid role");
    }

    // A League Admin can never create an Admin or another League Admin — only
    // the site Admin (callerLeagueIds === null) can create those two roles.
    if (callerLeagueIds !== null && (role === "ADMIN" || role === "LEAGUE_ADMIN")) {
      throw new AuthError("You do not have permission to create this role");
    }

    // An ADMIN account is always unscoped (leagueId null); every other role
    // belongs to exactly one league — the caller's own if they're a
    // single-league League Admin, or one picked from a form field otherwise
    // (site Admin, or a multi-league League Admin — picker UI for that case
    // is deferred Phase 5 polish).
    const targetLeagueId: string | null =
      role === "ADMIN"
        ? null
        : callerLeagueIds?.length === 1
          ? callerLeagueIds[0]
          : String(formData.get("leagueId") ?? "");

    if (role !== "ADMIN" && !targetLeagueId) {
      throw new ValidationError("A league must be selected for this user");
    }

    if (targetLeagueId) {
      const league = await prisma.league.findUnique({ where: { id: targetLeagueId } });
      if (!league) throw new ValidationError("League not found");
      assertLeagueNotReadOnly(league);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (role === "ADMIN") {
      await prisma.user.create({
        data: {
          loginId,
          name,
          passwordHash,
          isSiteAdmin: true,
          isActive: true,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          loginId,
          name,
          passwordHash,
          isActive: true,
          memberships: {
            create: {
              leagueId: targetLeagueId!,
              role,
              // Admin-added memberships start active immediately — unlike a
              // self-registered signup, no separate approval step needed.
              isActive: true,
              managerBasePrice:
                role === "TEAM_MANAGER" && managerBasePrice ? Number(managerBasePrice) : null,
            },
          },
        },
      });
    }

    revalidatePath("/");
  });
  if (result.error) return result;
  redirect("/admin/users");
}

/** Admin-assisted re-association: an admin searches for an existing person
 * (by loginId/email/phone) and adds them directly to this league without
 * the person re-registering — the counterpart to the self-service flow in
 * app/register, for when an admin already knows who they're adding. */
export async function addExistingPersonAction(
  _prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  const result = await toActionResult(async () => {
    const { leagueIds: callerLeagueIds } = await requireAdminOrLeagueAdmin();

    const identifier = String(formData.get("identifier") ?? "").trim();
    const role = String(formData.get("role") ?? "") as Role;
    if (!identifier) throw new ValidationError("Enter a Login ID, email, or phone number");
    if (!["LEAGUE_ADMIN", "TEAM_MANAGER", "AUCTIONEER", "VIEWER"].includes(role)) {
      throw new ValidationError("Invalid role");
    }
    if (callerLeagueIds !== null && role === "LEAGUE_ADMIN") {
      throw new AuthError("You do not have permission to grant this role");
    }

    const targetLeagueId =
      callerLeagueIds?.length === 1 ? callerLeagueIds[0] : String(formData.get("leagueId") ?? "");
    if (!targetLeagueId) throw new ValidationError("A league must be selected");

    const league = await prisma.league.findUnique({ where: { id: targetLeagueId } });
    if (!league) throw new ValidationError("League not found");
    assertLeagueNotReadOnly(league);

    const person = await findPersonByIdentifier(identifier);
    if (!person) throw new ValidationError("No account found for that Login ID, email, or phone");

    const existingMembership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: person.id, leagueId: targetLeagueId } },
    });
    if (existingMembership) {
      throw new ValidationError(`"${person.name}" is already registered for this league`);
    }

    await prisma.leagueMembership.create({
      data: { userId: person.id, leagueId: targetLeagueId, role, isActive: true },
    });

    revalidatePath("/admin/users");
  });
  if (result.error) return result;
  redirect("/admin/users");
}

// This (and resetUserPasswordAction/setUserActiveAction below) is now only
// ever exercised against site-Admin identity rows — every other role is a
// LeagueMembership, managed via deleteMembershipAction/
// setMembershipActiveAction instead. Kept userId-based rather than folded
// into the membership actions since a site Admin genuinely is a whole
// identity, not a per-league row.
export async function deleteUserAction(userId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    if (leagueIds !== null) {
      throw new AuthError("You do not have permission to manage admin accounts");
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { isSiteAdmin: true } });
    if (!target) throw new ValidationError("User not found");
    if (!target.isSiteAdmin) {
      throw new ValidationError("Use the league membership actions for non-admin users");
    }

    await deleteUser(userId, session.user.id);
    revalidatePath("/admin/users");
    revalidatePath("/");
  });
}

// Unlike the other actions here, this one already avoided the
// thrown-message redaction problem: it catches its own errors and encodes
// them as a short ?error=CODE redirect (a convention app/profile/page.tsx
// already reads), rather than relying on a message crossing the action
// boundary at all. Left as-is.
export async function changePasswordAction(formData: FormData) {
  const session = await requireSession();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  try {
    if (!currentPassword || !newPassword) throw new ValidationError("missing-fields");
    if (newPassword.length < 8) throw new ValidationError("short");
    if (newPassword !== confirmPassword) throw new ValidationError("mismatch");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new ValidationError("wrong-current");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });
  } catch (error) {
    const code = error instanceof ValidationError ? error.message : "system";
    redirect(`/profile?error=${code}`);
  }
  redirect("/profile?success=1");
}

/** Self-service email/phone update, from the profile page. Both optional,
 * unique-when-provided — rejects saving a value already claimed by a
 * different account rather than silently overwriting the dedupe key. */
export async function updateProfileAction(formData: FormData) {
  const session = await requireSession();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();

  try {
    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, NOT: { id: session.user.id } },
      });
      if (existing) throw new ValidationError("email-taken");
    }
    if (phone) {
      const existing = await prisma.user.findFirst({
        where: { phone, NOT: { id: session.user.id } },
      });
      if (existing) throw new ValidationError("phone-taken");
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { email: email || null, phone: phone || null },
    });
  } catch (error) {
    const code = error instanceof ValidationError ? error.message : "system";
    redirect(`/profile?profileError=${code}`);
  }
  redirect("/profile?profileSuccess=1");
}

// Site-Admin only — a League Admin's membership-row actions are limited to
// approve/revoke (setMembershipActiveAction); password resets and removal
// are identity-affecting enough to reserve for a site Admin.
export async function resetUserPasswordAction(
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    if (leagueIds !== null) {
      throw new AuthError("Only a site Admin can reset a user's password");
    }
    const newPassword = String(formData.get("newPassword") ?? "");
    if (newPassword.length < 8) throw new ValidationError("Password must be at least 8 characters");

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw new ValidationError("User not found");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    revalidatePath("/admin/users");
  });
}

/** Admin-facing counterpart to updateProfileAction — lets an admin fix up a
 * person's email/phone on their behalf (e.g. they mistyped it, or need it
 * corrected to be found via findPersonByIdentifier). Same identity-level
 * scoping as resetUserPasswordAction: a League Admin is confined to people
 * with a membership in one of their own leagues, never a site Admin. */
export async function adminUpdateProfileAction(
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const phone = String(formData.get("phone") ?? "").trim();

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSiteAdmin: true, memberships: { select: { leagueId: true } } },
    });
    if (!target) throw new ValidationError("User not found");
    if (leagueIds !== null) {
      if (target.isSiteAdmin) {
        throw new AuthError("You do not have permission to edit this user's profile");
      }
      if (!target.memberships.some((m) => leagueIds.includes(m.leagueId))) {
        throw new AuthError("This user has no membership in your league(s)");
      }
    }

    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, NOT: { id: userId } },
      });
      if (existing) throw new ValidationError("That email is already in use by another account");
    }
    if (phone) {
      const existing = await prisma.user.findFirst({
        where: { phone, NOT: { id: userId } },
      });
      if (existing) throw new ValidationError("That phone number is already in use by another account");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { email: email || null, phone: phone || null },
    });
    revalidatePath("/admin/users");
  });
}

/** Disables/re-enables a person's whole account — unlike
 * setMembershipActiveAction (which only revokes one league's access), this
 * blocks login everywhere, across every league they belong to. Site-Admin
 * only: a League Admin could otherwise lock someone out of a league they
 * don't manage, so they're limited to the per-membership action instead. */
export async function setUserActiveAction(userId: string, isActive: boolean): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    if (leagueIds !== null) {
      throw new AuthError("Only a site Admin can disable a user's entire account");
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw new ValidationError("User not found");

    await setUserActive(userId, session.user.id, isActive);
    revalidatePath("/admin/users");
  });
}

/** Removes one person's access to a specific league — never deletes their
 * account, only this membership. */
// Site-Admin only — see the comment on resetUserPasswordAction above. A
// League Admin removes access via setMembershipActiveAction (Revoke)
// instead, which doesn't destroy the membership row.
export async function deleteMembershipAction(membershipId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    if (leagueIds !== null) {
      throw new AuthError("Only a site Admin can remove a person from a league");
    }

    await deleteMembership(membershipId, session.user.id);
    revalidatePath("/admin/users");
  });
}

/** Approves/revokes one person's access to a specific league. */
export async function setMembershipActiveAction(
  membershipId: string,
  isActive: boolean
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();

    if (leagueIds !== null) {
      const membership = await prisma.leagueMembership.findUnique({
        where: { id: membershipId },
        select: { leagueId: true },
      });
      if (!membership) throw new ValidationError("Membership not found");
      if (!leagueIds.includes(membership.leagueId)) {
        throw new AuthError("This membership belongs to a different league");
      }
    }

    await setMembershipActive(membershipId, session.user.id, isActive);
    revalidatePath("/admin/users");
  });
}
