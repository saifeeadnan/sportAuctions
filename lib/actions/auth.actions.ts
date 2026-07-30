"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdminOrLeagueAdmin, AuthError, type Role } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { deleteUser, setUserActive } from "@/lib/services/user.service";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function registerUserAction(formData: FormData) {
  const { leagueId: callerLeagueId } = await requireAdminOrLeagueAdmin();

  const loginId = String(formData.get("loginId") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const password = String(formData.get("password") ?? "");
  const managerBasePrice = formData.get("managerBasePrice");

  if (!loginId || !name || !password) {
    throw new Error("Login ID, name, and password are required");
  }
  if (!["ADMIN", "LEAGUE_ADMIN", "TEAM_MANAGER", "AUCTIONEER", "VIEWER"].includes(role)) {
    throw new Error("Invalid role");
  }

  // A League Admin can never create an Admin or another League Admin — only
  // the site Admin (callerLeagueId === null) can create those two roles.
  if (callerLeagueId !== null && (role === "ADMIN" || role === "LEAGUE_ADMIN")) {
    throw new AuthError("You do not have permission to create this role");
  }

  // An ADMIN account is always unscoped (leagueId null); every other role
  // belongs to exactly one league — the caller's own if they're a League
  // Admin, or one picked from a form field if the caller is the site Admin.
  const targetLeagueId: string | null =
    role === "ADMIN" ? null : callerLeagueId ?? String(formData.get("leagueId") ?? "");

  if (role !== "ADMIN" && !targetLeagueId) {
    throw new ValidationError("A league must be selected for this user");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      loginId,
      name,
      role,
      passwordHash,
      leagueId: targetLeagueId,
      managerBasePrice:
        role === "TEAM_MANAGER" && managerBasePrice
          ? Number(managerBasePrice)
          : null,
    },
  });

  revalidatePath("/");
  redirect("/admin/users");
}

export async function deleteUserAction(userId: string) {
  const { session, leagueId } = await requireAdminOrLeagueAdmin();

  if (leagueId !== null) {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, leagueId: true },
    });
    if (!target) throw new ValidationError("User not found");
    if (target.role === "ADMIN" || target.role === "LEAGUE_ADMIN") {
      throw new AuthError("You do not have permission to delete this user");
    }
    if (target.leagueId !== leagueId) {
      throw new AuthError("This user belongs to a different league");
    }
  }

  await deleteUser(userId, session.user.id);
  revalidatePath("/admin/users");
  revalidatePath("/");
}

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

export async function resetUserPasswordAction(userId: string, formData: FormData) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword.length < 8) throw new ValidationError("Password must be at least 8 characters");

  if (leagueId !== null) {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, leagueId: true },
    });
    if (!target) throw new ValidationError("User not found");
    if (target.role === "ADMIN" || target.role === "LEAGUE_ADMIN") {
      throw new AuthError("You do not have permission to reset this user's password");
    }
    if (target.leagueId !== leagueId) {
      throw new AuthError("This user belongs to a different league");
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  revalidatePath("/admin/users");
}

export async function setUserActiveAction(userId: string, isActive: boolean) {
  const { session, leagueId } = await requireAdminOrLeagueAdmin();

  if (leagueId !== null) {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, leagueId: true },
    });
    if (!target) throw new ValidationError("User not found");
    if (target.role === "ADMIN" || target.role === "LEAGUE_ADMIN") {
      throw new AuthError("You do not have permission to change this user's access");
    }
    if (target.leagueId !== leagueId) {
      throw new AuthError("This user belongs to a different league");
    }
  }

  await setUserActive(userId, session.user.id, isActive);
  revalidatePath("/admin/users");
}
