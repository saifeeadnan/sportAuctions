"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { createLeague, deleteLeague } from "@/lib/services/league.service";
import { uploadLeagueLogo } from "@/lib/services/leagueLogo.service";

export async function createLeagueAction(formData: FormData) {
  await requireRole("ADMIN");

  const league = await createLeague({
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
  });

  const logo = formData.get("logo") as File | null;
  if (logo && logo.size > 0) {
    const buffer = Buffer.from(await logo.arrayBuffer());
    await uploadLeagueLogo(league.id, { type: logo.type, data: buffer });
  }

  revalidatePath("/admin/leagues");
}

export async function deleteLeagueAction(leagueId: string) {
  await requireRole("ADMIN");
  await deleteLeague(leagueId);
  revalidatePath("/admin/leagues");
}
