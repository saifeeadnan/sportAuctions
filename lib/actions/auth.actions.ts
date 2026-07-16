"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, type Role } from "@/lib/auth/guards";
import { deleteUser } from "@/lib/services/user.service";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function registerUserAction(formData: FormData) {
  await requireRole("ADMIN");

  const loginId = String(formData.get("loginId") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const password = String(formData.get("password") ?? "");
  const managerBasePrice = formData.get("managerBasePrice");

  if (!loginId || !name || !password) {
    throw new Error("Login ID, name, and password are required");
  }
  if (!["ADMIN", "TEAM_MANAGER", "AUCTIONEER", "VIEWER"].includes(role)) {
    throw new Error("Invalid role");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      loginId,
      name,
      role,
      passwordHash,
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
  const session = await requireRole("ADMIN");
  await deleteUser(userId, session.user.id);
  revalidatePath("/admin/users");
  revalidatePath("/");
}
