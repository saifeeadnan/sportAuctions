import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { changePasswordWithMessage } from "@/lib/services/user.service";

/** Same current-password verification and length rule as changePasswordAction
 * (lib/actions/auth.actions.ts), via changePasswordWithMessage — the
 * human-readable-message counterpart to that action's short redirect-code
 * convention. Confirm-password matching is a pure client-side check (the
 * mobile screen), not repeated here — the server only needs to know what the
 * new password should be. */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    await changePasswordWithMessage(session.user.id, currentPassword, newPassword);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
