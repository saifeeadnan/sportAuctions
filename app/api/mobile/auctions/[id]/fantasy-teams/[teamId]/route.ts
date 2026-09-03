import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { deleteFantasyTeam } from "@/lib/services/fantasyTeam.service";

/** Viewer self-service delete of one of their own fantasy teams — mirrors
 * lib/actions/fantasyTeam.actions.ts's deleteMyFantasyTeamAction, just as a
 * plain route for the mobile client. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; teamId: string }> }) {
  try {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const { teamId } = await params;
    await deleteFantasyTeam(teamId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
