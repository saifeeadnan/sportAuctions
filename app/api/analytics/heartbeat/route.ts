import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { touchSession } from "@/lib/services/analytics.service";

export async function POST() {
  try {
    const session = await requireSession();
    await touchSession(session.user.analyticsSessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
