import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

/** A manager always arrives at the web console via a URL that already
 * contains their teamAuctionEntryId — there's no existing lookup for it.
 * A mobile client needs one, since it has no such URL to read it from. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("TEAM_MANAGER");
    const { id: auctionId } = await params;

    const entry = await prisma.teamAuctionEntry.findFirst({
      where: { auctionId, team: { managerId: session.user.id } },
      include: { team: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "You don't manage a team in this auction" }, { status: 404 });
    }

    return NextResponse.json({
      teamAuctionEntryId: entry.id,
      teamName: entry.team.name,
      budgetRemaining: entry.budgetRemaining,
      slotsFilled: entry.slotsFilled,
      slotsTotal: entry.slotsTotal,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
