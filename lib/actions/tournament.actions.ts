"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { createTournament, createTeam } from "@/lib/services/tournament.service";

export async function createTournamentAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const tournament = await createTournament({
    name: String(formData.get("name") ?? ""),
    rosterId: String(formData.get("rosterId") ?? ""),
    numTeams: Number(formData.get("numTeams")),
    squadSize: Number(formData.get("squadSize")),
    startDate: new Date(String(formData.get("startDate"))),
    endDate: new Date(String(formData.get("endDate"))),
    createdById: session.user.id,
  });

  redirect(`/admin/tournaments/${tournament.id}`);
}

export async function createTeamAction(formData: FormData) {
  await requireRole("ADMIN");

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const managerId = String(formData.get("managerId") ?? "");

  await createTeam({
    tournamentId,
    name: String(formData.get("name") ?? ""),
    managerId: managerId || undefined,
    managerOccupiesSlot: formData.get("managerOccupiesSlot") === "on",
  });

  redirect(`/admin/tournaments/${tournamentId}`);
}
