import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournament } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { addTournamentSponsor } from "@/lib/services/tournamentSponsor.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { id: tournamentId } = await params;
    await loadScopedTournament(tournamentId, leagueIds);

    const formData = await req.formData();
    const name = String(formData.get("name") ?? "");
    const websiteUrl = String(formData.get("websiteUrl") ?? "");
    const logoUrl = String(formData.get("logoUrl") ?? "");
    const tier = String(formData.get("tier") ?? "");
    const file = formData.get("logo") as File | null;
    if (!file && !logoUrl) {
      return NextResponse.json({ error: "Provide a logo file or a logo URL" }, { status: 400 });
    }

    const sponsor = await addTournamentSponsor({
      tournamentId,
      name,
      websiteUrl: websiteUrl || undefined,
      file: file ? { type: file.type, data: Buffer.from(await file.arrayBuffer()) } : undefined,
      logoUrl: logoUrl || undefined,
      tier: tier || undefined,
    });

    return NextResponse.json({ sponsorId: sponsor.id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
