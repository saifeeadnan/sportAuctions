"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  createLeague,
  deleteLeague,
  updateLeagueSettings,
  type LeagueSettingsInput,
} from "@/lib/services/league.service";
import { uploadLeagueLogo } from "@/lib/services/leagueLogo.service";

function dateOrNull(formData: FormData, key: string): Date | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? new Date(value) : null;
}

function intOrNull(formData: FormData, key: string): number | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? Number(value) : null;
}

function parseLeagueSettings(formData: FormData): LeagueSettingsInput {
  return {
    startDate: dateOrNull(formData, "startDate"),
    endDate: dateOrNull(formData, "endDate"),
    maxTournaments: intOrNull(formData, "maxTournaments"),
    maxTeamsPerTournament: intOrNull(formData, "maxTeamsPerTournament"),
    maxSponsorsPerTournament: intOrNull(formData, "maxSponsorsPerTournament"),
  };
}

// The unused prevState param lets this bind into useActionState
// (ActionResultForm) directly as a plain <form action={createLeagueAction}>.
export async function createLeagueAction(
  _prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    await requireRole("ADMIN");

    const league = await createLeague({
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? ""),
      ...parseLeagueSettings(formData),
    });

    const logo = formData.get("logo") as File | null;
    if (logo && logo.size > 0) {
      const buffer = Buffer.from(await logo.arrayBuffer());
      await uploadLeagueLogo(league.id, { type: logo.type, data: buffer });
    }

    revalidatePath("/admin/leagues");
  });
}

export async function updateLeagueSettingsAction(
  leagueId: string,
  input: LeagueSettingsInput
): Promise<ActionResult> {
  return toActionResult(async () => {
    await requireRole("ADMIN");
    await updateLeagueSettings(leagueId, input);
    revalidatePath("/admin/leagues");
  });
}

export async function deleteLeagueAction(leagueId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    await requireRole("ADMIN");
    await deleteLeague(leagueId);
    revalidatePath("/admin/leagues");
  });
}
