import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import {
  getResolvedPlayerPhoto,
  updatePlayerPhotoSelf,
  removePlayerPhotoSelf,
} from "@/lib/services/playerPhoto.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Deliberately no auth check at all, same posture as
    // /api/teams/[id]/sponsor-image: Player photos are embedded on public,
    // unauthenticated pages (app/highlights/[token], app/roster-card/[token]),
    // and gating this behind requireSession() would silently 403 the <img>
    // for every anonymous visitor.
    const { id: playerId } = await params;
    const resolved = await getResolvedPlayerPhoto(playerId);

    if (resolved.kind === "bytes") {
      return new NextResponse(new Uint8Array(resolved.data), {
        headers: {
          "Content-Type": resolved.mimeType,
          // A live-linked photo can change the moment the linked account
          // updates or removes their profile photo — a short cache is what
          // actually makes that "live" instead of stuck on whatever was
          // first fetched. An independently-uploaded photo only ever
          // changes via this same route, so it can cache longer, matching
          // the sponsor-image route's own max-age.
          "Cache-Control": resolved.live ? "public, max-age=60" : "public, max-age=300",
        },
      });
    }
    if (resolved.kind === "redirect") {
      return NextResponse.redirect(resolved.url, { headers: { "Cache-Control": "public, max-age=60" } });
    }
    return NextResponse.json({ error: "No photo available" }, { status: 404 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: playerId } = await params;
    const session = await requireSession();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const photoUrl = formData.get("photoUrl");

    await updatePlayerPhotoSelf(session.user.id, playerId, {
      file: file ? { type: file.type, data: Buffer.from(await file.arrayBuffer()) } : undefined,
      photoUrl: typeof photoUrl === "string" && photoUrl ? photoUrl : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: playerId } = await params;
    const session = await requireSession();
    await removePlayerPhotoSelf(session.user.id, playerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
