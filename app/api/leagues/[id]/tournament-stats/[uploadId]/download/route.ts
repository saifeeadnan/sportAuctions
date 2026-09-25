import { NextResponse } from "next/server";
import { assertInScope, requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { getStatsUploadFile } from "@/lib/services/tournamentStats.service";

// The exact file that was uploaded, admin-only — not a regenerated export.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: leagueId, uploadId } = await params;
    assertInScope(leagueIds, leagueId);

    const file = await getStatsUploadFile(leagueId, uploadId);
    if (!file) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

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
