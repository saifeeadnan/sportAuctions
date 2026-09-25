import { NextResponse } from "next/server";
import { assertInScope, requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { ValidationError } from "@/lib/errors";
import { uploadTournamentStats } from "@/lib/services/tournamentStats.service";

// Multipart: `file` (the original workbook, stored untouched), `sheets` (JSON of
// only the sheets the admin ticked, parsed in THEIR browser) and `label`. The
// server never parses `file` — SheetJS on untrusted bytes is exactly what this
// codebase refuses to do — it validates the JSON grids and stores both.
// The league comes from the URL, not the sidebar filter, so a multi-league
// League Admin can only ever write to a league they administer.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: leagueId } = await params;
    assertInScope(leagueIds, leagueId);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file provided");

    let sheets: unknown;
    try {
      sheets = JSON.parse(String(formData.get("sheets") ?? ""));
    } catch {
      throw new ValidationError("The sheet data could not be read — reload the page and try again");
    }
    const labelField = formData.get("label");

    const result = await uploadTournamentStats(
      leagueId,
      {
        fileName: file.name,
        mimeType: file.type,
        fileBytes: new Uint8Array(await file.arrayBuffer()),
        sheets,
        label: typeof labelField === "string" ? labelField : null,
      },
      session.user.id
    );
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
