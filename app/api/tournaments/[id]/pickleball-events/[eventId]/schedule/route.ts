import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournament } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { ValidationError } from "@/lib/errors";
import { savePickleballSchedule } from "@/lib/services/pickleballEvent.service";

// Multipart: `file` (the original workbook, stored untouched), `teams` and
// `matches` (JSON, parsed in the admin's browser and resolved to real Team
// ids in the upload's review screen). The server never parses `file` — same
// posture as app/api/leagues/[id]/tournament-stats/route.ts, and re-validates
// `teams`/`matches` itself rather than trusting what the browser sent.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  try {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: tournamentId, eventId } = await params;
    await loadScopedTournament(tournamentId, leagueIds);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file provided");

    const parseJson = (field: string) => {
      try {
        return JSON.parse(String(formData.get(field) ?? ""));
      } catch {
        throw new ValidationError(`The ${field} data could not be read — reload the page and try again`);
      }
    };

    await savePickleballSchedule(
      tournamentId,
      eventId,
      {
        fileName: file.name,
        mimeType: file.type,
        fileBytes: new Uint8Array(await file.arrayBuffer()),
        teams: parseJson("teams"),
        matches: parseJson("matches"),
      },
      session.user.id
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
