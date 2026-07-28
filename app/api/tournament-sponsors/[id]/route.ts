import { NextResponse } from "next/server";
import { requireSession, requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournamentSponsor } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import {
  deleteTournamentSponsor,
  getTournamentSponsorLogoContent,
} from "@/lib/services/tournamentSponsor.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Cosmetic branding, not sensitive — any authenticated user may view it,
    // matching the same precedent as team sponsor logos and player photos.
    await requireSession();
    const { id: sponsorId } = await params;

    const logo = await getTournamentSponsorLogoContent(sponsorId);
    if (!logo) {
      return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
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
    const { leagueId } = await requireAdminOrLeagueAdmin();
    const { id: sponsorId } = await params;
    await loadScopedTournamentSponsor(sponsorId, leagueId);

    await deleteTournamentSponsor(sponsorId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
