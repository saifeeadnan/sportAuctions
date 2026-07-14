"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, type Role } from "@/lib/auth/guards";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function registerUserAction(formData: FormData) {
  await requireRole("ADMIN");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const password = String(formData.get("password") ?? "");
  const managerBasePrice = formData.get("managerBasePrice");

  if (!email || !name || !password) {
    throw new Error("Email, name, and password are required");
  }
  if (!["ADMIN", "TEAM_MANAGER", "AUCTIONEER", "VIEWER"].includes(role)) {
    throw new Error("Invalid role");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      name,
      role,
      passwordHash,
      managerBasePrice:
        role === "TEAM_MANAGER" && managerBasePrice
          ? Number(managerBasePrice)
          : null,
    },
  });

  redirect("/admin/users");
}
