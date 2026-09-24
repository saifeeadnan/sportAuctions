import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { loadTeamRosterGrid } from "@/lib/services/teamRosterGrid.service";
import { teamRosterGridToXlsx, teamRosterGridFilename } from "@/lib/teamRosterGrid";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const grid = await loadTeamRosterGrid(session, id);

    return new NextResponse(new Uint8Array(teamRosterGridToXlsx(grid)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${teamRosterGridFilename(grid, "xlsx")}"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
