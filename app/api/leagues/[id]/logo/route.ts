import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import {
  uploadLeagueLogo,
  deleteLeagueLogo,
  getLeagueLogoContent,
} from "@/lib/services/leagueLogo.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // League create/delete is site-ADMIN-only (lib/actions/league.actions.ts)
    // — the logo follows the same bar.
    await requireRole("ADMIN");
    const { id: leagueId } = await params;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadLeagueLogo(leagueId, { type: file.type, data: buffer });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Cosmetic branding, not sensitive — any authenticated user may view it,
    // same bar as a team's sponsor image.
    await requireSession();
    const { id: leagueId } = await params;

    const logo = await getLeagueLogoContent(leagueId);
    if (!logo) {
      return NextResponse.json({ error: "No logo uploaded" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(logo.data), {
      headers: {
        "Content-Type": logo.mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id: leagueId } = await params;

    await deleteLeagueLogo(leagueId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
