import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { leagueNamesByIds } from "@/lib/services/league.service";
import { updateUserProfileWithMessage } from "@/lib/services/user.service";

export async function GET() {
  try {
    const session = await requireSession();
    const [account, leagueNames] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
        select: { email: true, phone: true },
      }),
      leagueNamesByIds(session.user.memberships.map((m) => m.leagueId)),
    ]);

    return NextResponse.json({
      id: session.user.id,
      name: session.user.name,
      isSiteAdmin: session.user.isSiteAdmin,
      email: account.email,
      phone: account.phone,
      memberships: session.user.memberships.map((m) => ({
        ...m,
        // Falls back to the raw id only if the league itself was deleted out
        // from under an existing membership — shouldn't normally happen.
        leagueName: leagueNames[m.leagueId] ?? m.leagueId,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Same optional, unique-when-provided email/phone semantics as
 * updateProfileAction (lib/actions/auth.actions.ts), via
 * updateUserProfileWithMessage — the human-readable-message counterpart to
 * that action's short redirect-code convention. */
export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

    await updateUserProfileWithMessage(session.user.id, { email, phone });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
