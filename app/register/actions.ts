"use server";

import { redirect } from "next/navigation";
import {
  resolveLoginIdStatus,
  registerSelf,
  joinLeagueWithExistingLogin,
} from "@/lib/services/selfRegistration.service";
import { ValidationError } from "@/lib/errors";

export async function checkLoginIdAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const loginId = String(formData.get("loginId") ?? "").trim();

  if (!loginId) {
    redirect(`/register?league=${leagueId}&error=missing-login-id`);
  }

  const status = await resolveLoginIdStatus(loginId);
  redirect(
    `/register?league=${leagueId}&loginId=${encodeURIComponent(loginId)}&mode=${status}`
  );
}

export async function registerSelfAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const loginId = String(formData.get("loginId") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  try {
    await registerSelf({ leagueId, loginId, password, confirmPassword });
  } catch (error) {
    const code = error instanceof ValidationError ? error.message : "system";
    redirect(`/register?league=${leagueId}&loginId=${encodeURIComponent(loginId)}&mode=new&error=${code}`);
  }
  redirect(`/register?league=${leagueId}&success=1`);
}

export async function joinLeagueWithExistingLoginAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const loginId = String(formData.get("loginId") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await joinLeagueWithExistingLogin({ leagueId, loginId, password });
  } catch (error) {
    const code = error instanceof ValidationError ? error.message : "system";
    redirect(
      `/register?league=${leagueId}&loginId=${encodeURIComponent(loginId)}&mode=existing&error=${code}`
    );
  }
  redirect(`/register?league=${leagueId}&success=1`);
}
