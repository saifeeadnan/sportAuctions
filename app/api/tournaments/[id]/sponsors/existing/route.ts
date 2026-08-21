import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournament, loadScopedTournamentSponsor } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { addExistingTournamentSponsor } from "@/lib/services/tournamentSponsor.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: tournamentId } = await params;
    await loadScopedTournament(tournamentId, leagueIds);

    const body = await req.json();
    const sourceSponsorId = typeof body?.sourceSponsorId === "string" ? body.sourceSponsorId : "";
    const tier = typeof body?.tier === "string" ? body.tier : undefined;
    if (!sourceSponsorId) {
      return NextResponse.json({ error: "sourceSponsorId is required" }, { status: 400 });
    }

    // Authorizes the SOURCE sponsor too — a League Admin must not be able to
    // copy a sponsor whose logo lives in a different league's tournament.
    await loadScopedTournamentSponsor(sourceSponsorId, leagueIds);

    const sponsor = await addExistingTournamentSponsor(tournamentId, sourceSponsorId, tier);
    return NextResponse.json({ sponsorId: sponsor.id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
