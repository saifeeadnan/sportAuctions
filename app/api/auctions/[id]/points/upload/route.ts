import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { parsePointsFile, applyPointsToAuction } from "@/lib/services/playerPoints.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: auctionId } = await params;
    await loadScopedAuction(auctionId, leagueIds);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = String(formData.get("mode") ?? "preview");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { validRows, errors } = parsePointsFile(buffer, file.name);

    if (mode === "commit") {
      const { updatedCount, unmatched } = await applyPointsToAuction(auctionId, validRows);
      return NextResponse.json({
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
