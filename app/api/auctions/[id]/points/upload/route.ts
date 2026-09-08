import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { parsePointsFile } from "@/lib/services/playerPoints.service";
import { applyPointsUpload } from "@/lib/services/fantasyPointsUpload.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: auctionId } = await params;
    await loadScopedAuction(auctionId, leagueIds);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = String(formData.get("mode") ?? "preview");
    const labelField = formData.get("label");
    const label = typeof labelField === "string" ? labelField : null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { validRows, errors } = parsePointsFile(buffer, file.name);

    if (mode === "commit") {
      const { uploadId, uploadedAt, updatedCount, unmatched } = await applyPointsUpload(
        auctionId,
        validRows,
        { actorUserId: session.user.id, fileName: file.name, label }
      );
      return NextResponse.json({
        uploadId,
        uploadedAt: uploadedAt?.toISOString() ?? null,
        updatedCount,
        unmatched,
        parseErrorCount: errors.length,
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
