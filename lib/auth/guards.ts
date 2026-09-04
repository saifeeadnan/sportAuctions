import { auth } from "@/auth";
import { headers } from "next/headers";
import { decodeMobileToken } from "@/lib/auth/mobileToken";

export type Role = "ADMIN" | "LEAGUE_ADMIN" | "TEAM_MANAGER" | "AUCTIONEER" | "VIEWER";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// auth()'s zero-arg form only ever forwards the incoming `cookie` header to
// Auth.js's session logic — any Authorization header is silently dropped
// before it gets there. Browsers never send an Authorization header on a
// same-origin page/action request, so checking the cookie session first,
// then falling back to a mobile bearer token, is transparent to every
// existing web call site: nothing here changes for the cookie path.
async function resolveSession() {
  const cookieSession = await auth();
  if (cookieSession?.user) return cookieSession;

  const authHeader = (await headers()).get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = await decodeMobileToken(authHeader.slice(7));
  if (!token) return null;

  return {
    user: {
      id: token.id,
      name: token.name,
      isSiteAdmin: token.isSiteAdmin ?? false,
      memberships: token.memberships ?? [],
      analyticsSessionId: token.analyticsSessionId,
    },
  };
}

export async function requireSession() {
  const session = await resolveSession();
  if (!session?.user) {
    throw new AuthError("Not authenticated");
  }
  return session;
}

type Session = Awaited<ReturnType<typeof requireSession>>;

/**
 * True if this session holds ANY of the given roles — either as the site
 * Admin (satisfies an "ADMIN" check) or via at least one league membership.
 * Use for broad, non-resource-specific gates (e.g. a whole route group's
 * layout) — not for checking access to one specific resource, which needs
 * `assertInScope` instead since a role held in League A shouldn't grant
 * access to a resource in League B.
 */
export async function requireRole(...roles: Role[]) {
  const session = await requireSession();
  const satisfiedAsAdmin = roles.includes("ADMIN") && session.user.isSiteAdmin;
  const satisfiedAsMember = session.user.memberships.some((m) => roles.includes(m.role as Role));
  if (!satisfiedAsAdmin && !satisfiedAsMember) {
    throw new AuthError(`Requires role: ${roles.join(" or ")}`);
  }
  return session;
}

/**
 * `null` = unrestricted (site ADMIN). Otherwise every league id where this
 * session holds one of the given roles — for filtering a list/dashboard
 * query across every league a person belongs to, not just one (replaces
 * the old single-`leagueId` `scopeLeagueId`).
 */
export function leagueIdsForRoles(session: Session, ...roles: Role[]): string[] | null {
  if (session.user.isSiteAdmin) return null;
  return session.user.memberships
    .filter((m) => roles.includes(m.role as Role))
    .map((m) => m.leagueId);
}

/**
 * `null` = unrestricted (site ADMIN). Otherwise every league id this session
 * belongs to at all, regardless of role there — for the Viewer/Manager/
 * Auctioneer pages, which (like the old single-`leagueId` `scopeLeagueId`)
 * scope by "my league(s)," not by which specific role I hold in each one.
 */
export function allLeagueIds(session: Session): string[] | null {
  if (session.user.isSiteAdmin) return null;
  return session.user.memberships.map((m) => m.leagueId);
}

/**
 * Throws unless `resourceLeagueId` is in the (pre-resolved, role-filtered)
 * `leagueIds` list — `null` means unrestricted (site Admin). Pairs with
 * `leagueIdsForRoles`/`requireAdminOrLeagueAdmin`'s `leagueIds`, same
 * contract as the old single-`leagueId` `assertInScope`, just checking
 * membership in a list instead of equality against one value.
 */
export function assertInScope(leagueIds: string[] | null, resourceLeagueId: string) {
  if (leagueIds !== null && !leagueIds.includes(resourceLeagueId)) {
    throw new AuthError("This resource belongs to a different league");
  }
}

export async function requireAdminOrLeagueAdmin() {
  const session = await requireRole("ADMIN", "LEAGUE_ADMIN");
  return { session, leagueIds: leagueIdsForRoles(session, "LEAGUE_ADMIN") };
}

/**
 * Who may act on one team's auction entry (its roster card, shareable
 * link): the team's own manager, OR a league admin of the league the
 * auction belongs to, OR the site Admin. An OR of independent grants —
 * deliberately not "if you're a manager anywhere, you must manage THIS
 * team", which would lock a league admin who also manages one team out of
 * every other team; and deliberately keyed on LEAGUE_ADMIN memberships only
 * (not `allLeagueIds`), so a league admin of A who is merely a viewer in B
 * gets nothing in B. Pure — takes the already-loaded entry rather than
 * querying, so it's usable from both route handlers and server actions.
 */
export function assertCanAccessTeamEntry(
  session: Session,
  entry: { team: { managerId: string | null }; auction: { tournament: { leagueId: string } } }
) {
  if (entry.team.managerId === session.user.id) return;
  const adminLeagues = leagueIdsForRoles(session, "LEAGUE_ADMIN"); // null = site admin
  if (adminLeagues === null || adminLeagues.includes(entry.auction.tournament.leagueId)) return;
  throw new AuthError("Not authorized for this team's roster card");
}
