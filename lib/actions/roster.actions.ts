"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { deleteRoster } from "@/lib/services/roster.service";

export async function deleteRosterAction(rosterId: string) {
  await requireRole("ADMIN");
  await deleteRoster(rosterId);
  revalidatePath("/admin/rosters");
}
