import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournament } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { addTournamentSponsor } from "@/lib/services/tournamentSponsor.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueId } = await requireAdminOrLeagueAdmin();
    const { id: tournamentId } = await params;
    await loadScopedTournament(tournamentId, leagueId);

    const formData = await req.formData();
    const name = String(formData.get("name") ?? "");
    const websiteUrl = String(formData.get("websiteUrl") ?? "");
    const file = formData.get("logo") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No logo file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sponsor = await addTournamentSponsor({
      tournamentId,
      name,
      websiteUrl: websiteUrl || undefined,
      file: { type: file.type, data: buffer },
    });

    return NextResponse.json({ sponsorId: sponsor.id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
