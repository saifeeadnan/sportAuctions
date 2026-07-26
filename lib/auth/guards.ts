import { auth } from "@/auth";

export type Role = "ADMIN" | "LEAGUE_ADMIN" | "TEAM_MANAGER" | "AUCTIONEER" | "VIEWER";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new AuthError("Not authenticated");
  }
  return session;
}

export async function requireRole(...roles: Role[]) {
  const session = await requireSession();
  if (!roles.includes(session.user.role as Role)) {
    throw new AuthError(`Requires role: ${roles.join(" or ")}`);
  }
  return session;
}

/** null = unrestricted (site ADMIN). Non-null = caller is confined to this league. */
export function scopeLeagueId(session: Awaited<ReturnType<typeof requireSession>>): string | null {
  return session.user.role === "ADMIN" ? null : (session.user.leagueId ?? null);
}

export function assertInScope(leagueId: string | null, resourceLeagueId: string) {
  if (leagueId !== null && leagueId !== resourceLeagueId) {
    throw new AuthError("This resource belongs to a different league");
  }
}

export async function requireAdminOrLeagueAdmin() {
  const session = await requireRole("ADMIN", "LEAGUE_ADMIN");
  return { session, leagueId: scopeLeagueId(session) };
}
