import { NextResponse } from "next/server";
import { requireSession, requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTeam } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import {
  uploadTeamSponsorImage,
  deleteTeamSponsorImage,
  getTeamSponsorImageContent,
} from "@/lib/services/teamSponsorImage.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueId } = await requireAdminOrLeagueAdmin();
    const { id: teamId } = await params;
    await loadScopedTeam(teamId, leagueId);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadTeamSponsorImage(teamId, { type: file.type, data: buffer });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Cosmetic branding, not sensitive — any authenticated user may view it
    // (matching the precedent that player photos are served with no auth at
    // all), so the only bar here is being logged in.
    await requireSession();
    const { id: teamId } = await params;

    const image = await getTeamSponsorImageContent(teamId);
    if (!image) {
      return NextResponse.json({ error: "No sponsor image uploaded" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueId } = await requireAdminOrLeagueAdmin();
    const { id: teamId } = await params;
    await loadScopedTeam(teamId, leagueId);

    await deleteTeamSponsorImage(teamId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
