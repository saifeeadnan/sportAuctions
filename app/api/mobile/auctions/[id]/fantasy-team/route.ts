import { NextResponse } from "next/server";
import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { getFantasyEligibility, getFantasyTeam, submitFantasyTeam } from "@/lib/services/fantasyTeam.service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const { id: auctionId } = await params;

    const eligibility = await getFantasyEligibility(auctionId, session.user.id, allLeagueIds(session));
    if (!eligibility.eligible) {
      return NextResponse.json({ eligible: false, reason: eligibility.reason });
    }

    const team = await getFantasyTeam(auctionId, session.user.id);
    return NextResponse.json({
      eligible: true,
      selfAuctionPlayerId: eligibility.selfAuctionPlayerId,
      team,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const { id: auctionId } = await params;
    const body = await req.json().catch(() => null);
    const auctionPlayerIds = Array.isArray(body?.auctionPlayerIds) ? body.auctionPlayerIds : [];
    const name = typeof body?.name === "string" ? body.name : undefined;

    const team = await submitFantasyTeam(
      auctionId,
      session.user.id,
      auctionPlayerIds,
      allLeagueIds(session),
      name
    );
    return NextResponse.json({ team });
  } catch (error) {
    return toErrorResponse(error);
  }
}
