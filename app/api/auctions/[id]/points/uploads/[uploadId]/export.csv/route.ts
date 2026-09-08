import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { getPointsUploadRows } from "@/lib/services/fantasyPointsUpload.service";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Downloads one points upload's snapshot as CSV — in the same Player /
 * Login ID / Points shape the upload form accepts, so any earlier snapshot
 * can be re-uploaded as-is to restore that state. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: auctionId, uploadId } = await params;
    const auction = await loadScopedAuction(auctionId, leagueIds);

    const snapshot = await getPointsUploadRows(auctionId, uploadId);
    if (!snapshot) {
      return NextResponse.json({ error: "Points upload not found" }, { status: 404 });
    }

    const header = ["Player", "Login ID", "Category", "Points"];
    const rows = snapshot.rows.map((r) => [r.playerName, r.loginId ?? "", r.categoryName, r.points]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

    // e.g. "Spring-Cup-points-20260908-0052-after-match-3.csv"
    const stamp = snapshot.upload.uploadedAt.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    const filename =
      `${auction.name}-points-${stamp}${snapshot.upload.label ? `-${snapshot.upload.label}` : ""}`
        .replace(/[^a-z0-9-]+/gi, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") + ".csv";

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
