import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { loadTeamRosterGrid } from "@/lib/services/teamRosterGrid.service";
import { teamRosterGridToCsv, teamRosterGridFilename } from "@/lib/teamRosterGrid";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const grid = await loadTeamRosterGrid(session, id);

    return new NextResponse(teamRosterGridToCsv(grid), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${teamRosterGridFilename(grid, "csv")}"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
