import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

/** Mirrors changePasswordAction (lib/actions/auth.actions.ts) — same current-
 * password verification and length rule, just JSON in/out. Confirm-password
 * matching is a pure client-side check (the mobile screen), not repeated
 * here — the server only needs to know what the new password should be. */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      throw new ValidationError("Current and new password are required");
    }
    if (newPassword.length < 8) {
      throw new ValidationError("New password must be at least 8 characters");
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new ValidationError("Current password is incorrect");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
