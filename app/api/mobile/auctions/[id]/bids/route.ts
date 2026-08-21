import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { placeBid } from "@/lib/services/bidding.service";

/** Mirrors placeBidAction (lib/actions/bidding.actions.ts) exactly, including
 * its manager-ownership check — no revalidation needed here either, since
 * the "bid:placed" socket event is what updates every connected client. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("TEAM_MANAGER");
    const { id: auctionId } = await params;
    const body = await req.json().catch(() => null);
    const auctionPlayerId = typeof body?.auctionPlayerId === "string" ? body.auctionPlayerId : "";
    const teamAuctionEntryId = typeof body?.teamAuctionEntryId === "string" ? body.teamAuctionEntryId : "";
    const amount = typeof body?.amount === "number" ? body.amount : NaN;

    const entry = await prisma.teamAuctionEntry.findUnique({
      where: { id: teamAuctionEntryId },
      include: { team: true },
    });
    if (!entry || entry.team.managerId !== session.user.id) {
      throw new ValidationError("You do not manage this team");
    }

    await placeBid(auctionId, auctionPlayerId, teamAuctionEntryId, amount);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
