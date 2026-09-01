import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournamentSponsor } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import {
  deleteTournamentSponsor,
  getTournamentSponsorLogoContent,
} from "@/lib/services/tournamentSponsor.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Cosmetic branding, not sensitive — deliberately no auth check at all.
    // The public, unauthenticated highlights page (app/highlights/[token])
    // embeds these via SponsorRibbon for anyone with the share link, logged
    // in or not; gating this behind requireSession() (the original posture)
    // silently 403'd every sponsor logo <img> for an anonymous visitor.
    const { id: sponsorId } = await params;

    const logo = await getTournamentSponsorLogoContent(sponsorId);
    // A URL-backed sponsor has no stored bytes — its <img> never points here
    // in the first place, but treat a direct hit the same as "not found"
    // rather than serving an empty body.
    if (!logo || !logo.data || !logo.mimeType) {
      return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(logo.data), {
      headers: {
        "Content-Type": logo.mimeType,
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
    const { id: sponsorId } = await params;
    await loadScopedTournamentSponsor(sponsorId, leagueIds);

    await deleteTournamentSponsor(sponsorId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
