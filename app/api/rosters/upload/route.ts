import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { ValidationError } from "@/lib/errors";
import { parseRosterFile, createRosterFromUpload } from "@/lib/services/roster.service";
import { getLeagueRosterFieldConfig } from "@/lib/services/league.service";

export async function POST(req: Request) {
  try {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rosterName = String(formData.get("rosterName") ?? "");
    const mode = String(formData.get("mode") ?? "preview");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // A single-league League Admin's roster always belongs to their own
    // league; a site Admin (unrestricted) or a multi-league League Admin
    // picks a league via the form — resolved for Preview too (not just
    // Confirm) so league-mandatory-field errors surface before commit.
    const targetLeagueId =
      leagueIds?.length === 1 ? leagueIds[0] : String(formData.get("leagueId") ?? "");
    const mandatoryFields = targetLeagueId ? await getLeagueRosterFieldConfig(targetLeagueId) : [];

    const buffer = Buffer.from(await file.arrayBuffer());
    const { validRows, errors } = parseRosterFile(buffer, file.name, mandatoryFields);

    if (mode === "commit") {
      if (!targetLeagueId) {
        throw new ValidationError("A league must be selected for this roster");
      }
      const roster = await createRosterFromUpload(
        rosterName,
        validRows,
        session.user.id,
        targetLeagueId
      );
      return NextResponse.json({
        rosterId: roster.id,
        validCount: validRows.length,
        errorCount: errors.length,
      });
    }

    return NextResponse.json({
      validCount: validRows.length,
      errors,
      sample: validRows.slice(0, 10),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
