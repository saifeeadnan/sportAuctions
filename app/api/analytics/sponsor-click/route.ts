import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { recordSponsorClick } from "@/lib/services/analytics.service";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const sponsorId = typeof body?.sponsorId === "string" ? body.sponsorId : "";
    if (!sponsorId) {
      return NextResponse.json({ error: "sponsorId is required" }, { status: 400 });
    }

    await recordSponsorClick({ sponsorId, userId: session.user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
