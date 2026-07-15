"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export async function loginAction(formData: FormData) {
  const loginId = String(formData.get("loginId") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      loginId,
      password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      redirect("/login?error=invalid");
    }
    if (error instanceof AuthError) {
      console.error("Login failed due to a system error:", error.cause ?? error);
      redirect("/login?error=system");
    }
    throw error;
  }
}
