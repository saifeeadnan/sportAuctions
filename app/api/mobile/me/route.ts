import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { leagueNamesByIds } from "@/lib/services/league.service";

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

/** Mirrors updateProfileAction (lib/actions/auth.actions.ts) exactly — same
 * optional, unique-when-provided email/phone semantics — just JSON in/out
 * instead of a redirect-driven form. */
export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, NOT: { id: session.user.id } },
      });
      if (existing) throw new ValidationError("That email is already in use by another account");
    }
    if (phone) {
      const existing = await prisma.user.findFirst({
        where: { phone, NOT: { id: session.user.id } },
      });
      if (existing) throw new ValidationError("That phone number is already in use by another account");
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { email: email || null, phone: phone || null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
