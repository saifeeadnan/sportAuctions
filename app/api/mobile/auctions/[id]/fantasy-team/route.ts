import { NextResponse } from "next/server";
import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import {
  getFantasyEligibility,
  getFantasyTeam,
  getMaxRosterSize,
  isFantasyEditingLocked,
  listFantasyPlayerPool,
  submitFantasyTeam,
} from "@/lib/services/fantasyTeam.service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const { id: auctionId } = await params;

    const eligibility = await getFantasyEligibility(auctionId, session.user.id, allLeagueIds(session));
    if (!eligibility.eligible) {
      return NextResponse.json({ eligible: false, reason: eligibility.reason });
    }

    const [team, pool, cap] = await Promise.all([
      getFantasyTeam(auctionId, session.user.id),
      listFantasyPlayerPool(auctionId),
      getMaxRosterSize(auctionId),
    ]);
    return NextResponse.json({
      eligible: true,
      selfAuctionPlayerId: eligibility.selfAuctionPlayerId,
      locked: isFantasyEditingLocked(eligibility.auction),
      lockDate: (eligibility.auction.fantasyLockDate ?? eligibility.auction.tournament.startDate).toISOString(),
      budget: String(eligibility.auction.teamBudget),
      cap,
      pool,
      team,
      auctionName: eligibility.auction.name,
      tournamentName: eligibility.auction.tournament.name,
      leagueName: eligibility.auction.tournament.league.name,
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
