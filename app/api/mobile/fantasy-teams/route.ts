import { NextResponse } from "next/server";
import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { listFantasyEligibilityOverview } from "@/lib/services/fantasyTeam.service";

export async function GET() {
  try {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const overview = await listFantasyEligibilityOverview(session.user.id, allLeagueIds(session));
    return NextResponse.json(overview);
  } catch (error) {
    return toErrorResponse(error);
  }
}
