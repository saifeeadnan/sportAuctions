import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTeam } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import {
  uploadTeamSponsorImage,
  deleteTeamSponsorImage,
  getTeamSponsorImageContent,
} from "@/lib/services/teamSponsorImage.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: teamId } = await params;
    await loadScopedTeam(teamId, leagueIds);

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
    // Cosmetic branding, not sensitive — deliberately no auth check at all,
    // same posture as /api/tournament-sponsors/[id]: the public,
    // unauthenticated roster-card page (app/roster-card/[token]) embeds this
    // image for anyone with the share link, logged in or not, and gating it
    // behind requireSession() would silently 403 the <img> for every
    // anonymous visitor.
    const { id: teamId } = await params;

    const image = await getTeamSponsorImageContent(teamId);
    if (!image) {
      return NextResponse.json({ error: "No sponsor image uploaded" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: teamId } = await params;
    await loadScopedTeam(teamId, leagueIds);

    await deleteTeamSponsorImage(teamId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
