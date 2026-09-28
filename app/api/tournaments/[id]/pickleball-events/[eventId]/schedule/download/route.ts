import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournament } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { getPickleballScheduleFile } from "@/lib/services/pickleballEvent.service";

// The exact file that was uploaded, admin-only — not a regenerated export.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: tournamentId, eventId } = await params;
    await loadScopedTournament(tournamentId, leagueIds);

    const file = await getPickleballScheduleFile(tournamentId, eventId);
    if (!file) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

    // Header values can't carry quotes or line breaks; the stored name is
    // whatever the browser sent.
    const safeName = file.fileName.replace(/[^\w.\- ()]+/g, "_");
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
