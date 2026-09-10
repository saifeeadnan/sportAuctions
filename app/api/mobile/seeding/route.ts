import { NextResponse } from "next/server";
import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { listSeedingRosters } from "@/lib/services/playerSeeding.service";

export async function GET() {
  try {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const rosters = await listSeedingRosters(session.user.id, allLeagueIds(session));
    return NextResponse.json(
      rosters.map((r) => ({
        rosterId: r.rosterId,
        rosterName: r.rosterName,
        leagueName: r.leagueName,
        status: r.status,
        opensAt: r.opensAt.toISOString(),
        closesAt: r.closesAt.toISOString(),
        maxSeed: r.maxSeed,
        ratedCount: r.ratedCount,
        ratableCount: r.ratableCount,
      }))
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
