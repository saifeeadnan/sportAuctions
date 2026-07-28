"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { createLeague, deleteLeague } from "@/lib/services/league.service";

export async function createLeagueAction(formData: FormData) {
  await requireRole("ADMIN");

  await createLeague({
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
  });

  revalidatePath("/admin/leagues");
}

export async function deleteLeagueAction(leagueId: string) {
  await requireRole("ADMIN");
  await deleteLeague(leagueId);
  revalidatePath("/admin/leagues");
}
