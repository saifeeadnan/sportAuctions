import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { ValidationError } from "@/lib/errors";
import { getLeagueRosterFieldConfig } from "@/lib/services/league.service";
import { rosterTemplateHeaderRow } from "@/lib/services/roster.service";

// A header-only starting file for a league's roster upload — distinct from
// /api/rosters/[id]/export.csv, which is keyed on an existing rosterId that
// doesn't exist yet at this point in the flow.
export async function GET(req: Request) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { searchParams } = new URL(req.url);

    const targetLeagueId =
      leagueIds?.length === 1 ? leagueIds[0] : searchParams.get("leagueId");
    if (!targetLeagueId) {
      throw new ValidationError("A league must be selected to download a roster template");
    }
    assertInScope(leagueIds, targetLeagueId);

    const mandatoryFields = await getLeagueRosterFieldConfig(targetLeagueId);
    const header = rosterTemplateHeaderRow(mandatoryFields);

    return new NextResponse(header.join(",") + "\n", {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="roster-template.csv"',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
