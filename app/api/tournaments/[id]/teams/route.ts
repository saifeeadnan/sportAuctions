import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournament } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { createTeam } from "@/lib/services/tournament.service";
import { uploadTeamSponsorImage } from "@/lib/services/teamSponsorImage.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueId } = await requireAdminOrLeagueAdmin();
    const { id: tournamentId } = await params;
    await loadScopedTournament(tournamentId, leagueId);

    const formData = await req.formData();
    const managerId = String(formData.get("managerId") ?? "");
    const file = formData.get("sponsorImage") as File | null;

    const team = await createTeam({
      tournamentId,
      name: String(formData.get("name") ?? ""),
      managerId: managerId || undefined,
      managerOccupiesSlot: formData.get("managerOccupiesSlot") === "on",
    });

    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await uploadTeamSponsorImage(team.id, { type: file.type, data: buffer });
    }

    return NextResponse.json({ teamId: team.id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
