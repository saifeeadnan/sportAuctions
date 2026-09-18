import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import {
  updateUserProfilePhoto,
  removeUserProfilePhoto,
  getUserPhotoContent,
} from "@/lib/services/user.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id: userId } = await params;
    if (userId !== session.user.id) {
      return NextResponse.json({ error: "You can only update your own profile photo" }, { status: 403 });
    }

    const formData = await req.formData();
    const photoUrl = String(formData.get("photoUrl") ?? "");
    const file = formData.get("file") as File | null;

    await updateUserProfilePhoto(userId, {
      file: file ? { type: file.type, data: Buffer.from(await file.arrayBuffer()) } : undefined,
      photoUrl: photoUrl || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Any authenticated user may view it — same bar as a league logo, the
    // more privacy-conscious of the two existing bytes-route patterns in
    // this codebase (unlike team/tournament branding, a person's own photo
    // isn't treated as fully public here).
    await requireSession();
    const { id: userId } = await params;

    const user = await getUserPhotoContent(userId);
    if (!user || !user.photoData || !user.photoMimeType) {
      return NextResponse.json({ error: "No photo uploaded" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(user.photoData), {
      headers: {
        "Content-Type": user.photoMimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id: userId } = await params;
    if (userId !== session.user.id) {
      return NextResponse.json({ error: "You can only remove your own profile photo" }, { status: 403 });
    }

    await removeUserProfilePhoto(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
