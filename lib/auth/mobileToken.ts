import { encode, decode } from "next-auth/jwt";

// Only NEXTAUTH_SECRET is ever set in this deployment (.env, render.yaml) —
// no AUTH_SECRET — matching server.ts's own existing convention exactly.
const secret = process.env.NEXTAUTH_SECRET!;

// A salt distinct from the browser session cookie's own — a leaked mobile
// token can't be replayed as a cookie value, or vice versa, even though
// both are encoded with the same secret.
const MOBILE_TOKEN_SALT = "mobile-session-token";

export type MobileTokenPayload = {
  id: string;
  name: string;
  isSiteAdmin: boolean;
  memberships: { leagueId: string; role: string }[];
  analyticsSessionId: string;
};

/** Issued once at mobile login, stored client-side (Keychain/Keystore), sent
 * back as `Authorization: Bearer <token>` (HTTP) or `auth.token` (Socket.IO).
 * 30-day expiry, matching the web session's own default. */
export async function encodeMobileToken(payload: MobileTokenPayload): Promise<string> {
  return encode({ token: payload, secret, salt: MOBILE_TOKEN_SALT });
}

/** Returns `null` for a missing, tampered, or expired token — callers treat
 * that identically to "no credential provided," never a hard error. */
export async function decodeMobileToken(token: string): Promise<MobileTokenPayload | null> {
  try {
    const decoded = await decode({ token, secret, salt: MOBILE_TOKEN_SALT });
    return (decoded as MobileTokenPayload | null) ?? null;
  } catch {
    return null;
  }
}
