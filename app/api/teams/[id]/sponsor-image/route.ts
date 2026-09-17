import { NextResponse } from "next/server";
import { requireSession, assertCanManageTeam } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/api/errors";
import {
  uploadTeamSponsorImage,
  deleteTeamSponsorImage,
  getTeamSponsorImageContent,
} from "@/lib/services/teamSponsorImage.service";

/** The team's own manager, a league admin of its league, or the site Admin —
 * same OR-of-grants shape as assertCanAccessTeamEntry, just for a bare Team
 * (a manager should be able to set their sponsor picture before the team has
 * ever entered an auction, so this can't be scoped through TeamAuctionEntry). */
async function loadTeamForSponsorImageManagement(teamId: string) {
  const session = await requireSession();
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { tournament: { select: { leagueId: true } } },
  });
  if (!team) return null;
  assertCanManageTeam(session, team);
  return team;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: teamId } = await params;
    const team = await loadTeamForSponsorImageManagement(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

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
    const { id: teamId } = await params;
    const team = await loadTeamForSponsorImageManagement(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    await deleteTeamSponsorImage(teamId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
