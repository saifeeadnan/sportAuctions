import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { CredentialsSignin } from "next-auth";
import { createAnalyticsSession, recordLogin } from "@/lib/services/analytics.service";

// A distinct `code` (surfaced via the thrown error, not the generic "wrong
// credentials" case) so the login page can show a specific message instead
// of implying the password was wrong.
export class AccountDisabledSignin extends CredentialsSignin {
  code = "account_disabled";
}

export type VerifiedUser = {
  id: string;
  name: string;
  isSiteAdmin: boolean;
  memberships: { leagueId: string; role: string }[];
  analyticsSessionId: string;
};

/**
 * The single place that checks a loginId/password pair — shared by the web
 * Credentials provider (auth.ts) and the mobile login route, so both get
 * identical behavior (casing normalization, bcrypt cost, disabled-account
 * handling, analytics session creation) with no duplicated logic.
 */
export async function verifyCredentials(
  loginId: string | undefined,
  password: string | undefined,
  request: { headers: Headers }
): Promise<VerifiedUser | null> {
  // Every path that creates or looks up a loginId elsewhere in the app
  // (selfRegistration.service.ts, admin user creation) normalizes to
  // trimmed lowercase before it touches the database — match that here
  // too, or a login typed with different casing (e.g. a mobile keyboard
  // auto-capitalizing the first letter) fails to find the user and looks
  // exactly like a wrong password.
  const normalizedLoginId = loginId?.trim().toLowerCase();
  if (!normalizedLoginId || !password) return null;

  const user = await prisma.user.findUnique({
    where: { loginId: normalizedLoginId },
    // Only active (approved) memberships grant session access — a pending
    // self-registration for a second league shouldn't let someone act in
    // that league until its admin approves it.
    include: { memberships: { where: { isActive: true }, select: { leagueId: true, role: true } } },
  });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  // Checked only after the password is confirmed correct, so a brute-force
  // attempt against an unknown password can't be used to probe whether an
  // account has been disabled.
  if (!user.isActive) throw new AccountDisabledSignin();

  // Analytics writes are best-effort — a hiccup here must never block a
  // legitimate login.
  const analyticsSession = await createAnalyticsSession(user.id).catch((err) => {
    console.error("[analytics] failed to create session:", err);
    return null;
  });
  await recordLogin({
    userId: user.id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  }).catch((err) => console.error("[analytics] failed to record login:", err));

  return {
    id: user.id,
    name: user.name,
    isSiteAdmin: user.isSiteAdmin,
    memberships: user.memberships,
    analyticsSessionId: analyticsSession?.id ?? "",
  };
}
