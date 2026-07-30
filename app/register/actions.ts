"use server";

import { redirect } from "next/navigation";
import { registerSelf } from "@/lib/services/selfRegistration.service";
import { ValidationError } from "@/lib/errors";

export async function registerSelfAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const loginId = String(formData.get("loginId") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  try {
    await registerSelf({ leagueId, loginId, password, confirmPassword });
  } catch (error) {
    const code = error instanceof ValidationError ? error.message : "system";
    redirect(`/register?league=${leagueId}&error=${code}`);
  }
  redirect(`/register?league=${leagueId}&success=1`);
}
