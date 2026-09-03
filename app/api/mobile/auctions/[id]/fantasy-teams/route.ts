import { NextResponse } from "next/server";
import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import {
  getFantasyEligibility,
  listMyFantasyTeams,
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

    const [teams, pool, cap] = await Promise.all([
      listMyFantasyTeams(auctionId, session.user.id),
      listFantasyPlayerPool(auctionId, eligibility.auction.fantasyPricingModel, eligibility.selfAuctionPlayerId),
      getMaxRosterSize(auctionId),
    ]);
    return NextResponse.json({
      eligible: true,
      selfAuctionPlayerId: eligibility.selfAuctionPlayerId,
      selfPickRequired: eligibility.auction.fantasySelfPickRequired,
      locked: isFantasyEditingLocked(eligibility.auction),
      lockDate: (eligibility.auction.fantasyLockDate ?? eligibility.auction.tournament.startDate).toISOString(),
      budget: String(eligibility.auction.teamBudget),
      cap,
      maxTeams: eligibility.auction.fantasyMaxTeamsPerUser,
      pool,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        picks: t.picks.map((p) => p.auctionPlayerId),
      })),
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
    const fantasyTeamId = typeof body?.fantasyTeamId === "string" ? body.fantasyTeamId : undefined;

    const team = await submitFantasyTeam(
      auctionId,
      session.user.id,
      auctionPlayerIds,
      allLeagueIds(session),
      name,
      fantasyTeamId
    );
    return NextResponse.json({ team });
  } catch (error) {
    return toErrorResponse(error);
  }
}
