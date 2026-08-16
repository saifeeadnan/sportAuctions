import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

export type RecordLoginInput = {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
};

export async function recordLogin(input: RecordLoginInput) {
  return prisma.loginEvent.create({
    data: { userId: input.userId, ipAddress: input.ipAddress, userAgent: input.userAgent },
  });
}

export async function createAnalyticsSession(userId: string) {
  return prisma.analyticsSession.create({ data: { userId } });
}

// Heartbeats ping every 45s (AnalyticsHeartbeat.tsx) while a tab is open and
// visible — a gap larger than this means the tab was closed, backgrounded
// past a missed ping, or the computer slept, so it shouldn't count as active
// time even though the same session row keeps getting touched for as long as
// the login's JWT stays valid (up to 30 days).
const MAX_GAP_MS = 2 * 60_000;

export async function touchSession(sessionId: string) {
  const session = await prisma.analyticsSession.findUnique({
    where: { id: sessionId },
    select: { lastSeenAt: true },
  });
  if (!session) return;

  const now = new Date();
  const gapMs = now.getTime() - session.lastSeenAt.getTime();
  const activeDelta = Math.min(Math.max(0, gapMs), MAX_GAP_MS);

  await prisma.analyticsSession.update({
    where: { id: sessionId },
    data: { lastSeenAt: now, activeMs: { increment: activeDelta } },
  });
}

export type RecordSponsorClickInput = {
  sponsorId: string;
  userId: string;
};

export async function recordSponsorClick(input: RecordSponsorClickInput) {
  const sponsor = await prisma.tournamentSponsor.findUnique({ where: { id: input.sponsorId } });
  if (!sponsor) throw new ValidationError("Sponsor not found");

  return prisma.sponsorClickEvent.create({
    data: { sponsorId: input.sponsorId, userId: input.userId },
  });
}

export type PaginationParams = { page?: number; pageSize?: number };
export type PaginatedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

/** A person can hold several league memberships now — collapses them into
 * the single role/league display string these analytics tables show. */
function describeUserRole(user: {
  isSiteAdmin: boolean;
  memberships: { role: string; league: { name: string } }[];
}): { role: string; leagueName: string | null } {
  if (user.isSiteAdmin) return { role: "ADMIN", leagueName: null };
  if (user.memberships.length === 0) return { role: "—", leagueName: null };
  return {
    role: user.memberships.map((m) => m.role).join(", "),
    leagueName: user.memberships.map((m) => m.league.name).join(", "),
  };
}

export async function getLoginSummary({
  page = 1,
  pageSize = 10,
}: PaginationParams = {}): Promise<PaginatedResult<{
  id: string;
  loginAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  user: { id: string; name: string; loginId: string; role: string; league: { name: string } | null };
}>> {
  const [total, rawItems] = await Promise.all([
    prisma.loginEvent.count(),
    prisma.loginEvent.findMany({
      orderBy: { loginAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        loginAt: true,
        ipAddress: true,
        userAgent: true,
        user: {
          select: {
            id: true,
            name: true,
            loginId: true,
            isSiteAdmin: true,
            memberships: { select: { role: true, league: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);
  const items = rawItems.map((event) => {
    const { role, leagueName } = describeUserRole(event.user);
    return {
      ...event,
      user: { id: event.user.id, name: event.user.name, loginId: event.user.loginId, role, league: leagueName ? { name: leagueName } : null },
    };
  });
  return { items, total, page, pageSize };
}

export async function getTimeSpentSummary({
  page = 1,
  pageSize = 10,
}: PaginationParams = {}): Promise<
  PaginatedResult<{
    userId: string;
    name: string;
    loginId: string;
    role: string;
    leagueName: string | null;
    totalMs: number;
    sessionCount: number;
  }>
> {
  const sessions = await prisma.analyticsSession.findMany({
    select: {
      userId: true,
      activeMs: true,
      user: {
        select: {
          name: true,
          loginId: true,
          isSiteAdmin: true,
          memberships: { select: { role: true, league: { select: { name: true } } } },
        },
      },
    },
  });

  const byUser = new Map<
    string,
    {
      userId: string;
      name: string;
      loginId: string;
      role: string;
      leagueName: string | null;
      totalMs: number;
      sessionCount: number;
    }
  >();
  for (const s of sessions) {
    const { role, leagueName } = describeUserRole(s.user);
    const entry = byUser.get(s.userId) ?? {
      userId: s.userId,
      name: s.user.name,
      loginId: s.user.loginId,
      role,
      leagueName,
      totalMs: 0,
      sessionCount: 0,
    };
    entry.totalMs += s.activeMs;
    entry.sessionCount += 1;
    byUser.set(s.userId, entry);
  }

  // Aggregated across ALL sessions first (there's no way to sort/page this at
  // the DB level since totals are only known after grouping by user in JS),
  // then paginated same as the other two summaries.
  const sorted = Array.from(byUser.values()).sort((a, b) => b.totalMs - a.totalMs);
  const start = (page - 1) * pageSize;
  return { items: sorted.slice(start, start + pageSize), total: sorted.length, page, pageSize };
}

export async function getSponsorClickSummary({
  page = 1,
  pageSize = 10,
}: PaginationParams = {}): Promise<
  PaginatedResult<{
    sponsorId: string;
    clicks: number;
    sponsorName: string;
    tournamentName: string | null;
  }>
> {
  const grouped = await prisma.sponsorClickEvent.groupBy({
    by: ["sponsorId"],
    _count: { _all: true },
  });
  if (grouped.length === 0) return { items: [], total: 0, page, pageSize };

  const sponsors = await prisma.tournamentSponsor.findMany({
    where: { id: { in: grouped.map((g) => g.sponsorId) } },
    select: { id: true, name: true, tournament: { select: { name: true } } },
  });
  const sponsorById = new Map(sponsors.map((s) => [s.id, s]));

  const sorted = grouped
    .map((g) => ({
      sponsorId: g.sponsorId,
      clicks: g._count._all,
      sponsorName: sponsorById.get(g.sponsorId)?.name ?? "(deleted sponsor)",
      tournamentName: sponsorById.get(g.sponsorId)?.tournament.name ?? null,
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const start = (page - 1) * pageSize;
  return { items: sorted.slice(start, start + pageSize), total: sorted.length, page, pageSize };
}
