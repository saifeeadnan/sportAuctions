import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";

export async function GET() {
  try {
    const session = await requireSession();
    return NextResponse.json({
      id: session.user.id,
      name: session.user.name,
      isSiteAdmin: session.user.isSiteAdmin,
      memberships: session.user.memberships,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
