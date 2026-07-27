import { NextResponse } from "next/server";
import { requireSession, requireAdminOrLeagueAdmin, AuthError } from "@/lib/auth/guards";
import { loadScopedTournament } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import {
  uploadRulesDocument,
  deleteRulesDocument,
  getRulesDocumentContent,
  canViewRulesDocument,
} from "@/lib/services/tournamentDocument.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, leagueId } = await requireAdminOrLeagueAdmin();
    const { id: tournamentId } = await params;
    await loadScopedTournament(tournamentId, leagueId);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadRulesDocument(
      tournamentId,
      { name: file.name, type: file.type || "application/octet-stream", data: buffer },
      session.user.id
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id: tournamentId } = await params;

    const allowed = await canViewRulesDocument(tournamentId, session.user);
    if (!allowed) {
      throw new AuthError("You do not have permission to view this document");
    }

    const document = await getRulesDocumentContent(tournamentId);
    if (!document) {
      return NextResponse.json({ error: "No rules document has been uploaded yet" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(document.data), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueId } = await requireAdminOrLeagueAdmin();
    const { id: tournamentId } = await params;
    await loadScopedTournament(tournamentId, leagueId);

    await deleteRulesDocument(tournamentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
