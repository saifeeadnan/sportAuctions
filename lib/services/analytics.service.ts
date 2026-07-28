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

export async function touchSession(sessionId: string) {
  await prisma.analyticsSession.updateMany({
    where: { id: sessionId },
    data: { lastSeenAt: new Date() },
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

export async function getLoginSummary({
  page = 1,
  pageSize = 10,
}: PaginationParams = {}): Promise<PaginatedResult<{
  id: string;
  loginAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  user: { id: string; name: string; loginId: string; role: string };
}>> {
  const [total, items] = await Promise.all([
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
        user: { select: { id: true, name: true, loginId: true, role: true } },
      },
    }),
  ]);
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
    totalMs: number;
    sessionCount: number;
  }>
> {
  const sessions = await prisma.analyticsSession.findMany({
    select: {
      userId: true,
      startedAt: true,
      lastSeenAt: true,
      user: { select: { name: true, loginId: true, role: true } },
    },
  });

  const byUser = new Map<
    string,
    { userId: string; name: string; loginId: string; role: string; totalMs: number; sessionCount: number }
  >();
  for (const s of sessions) {
    const durationMs = s.lastSeenAt.getTime() - s.startedAt.getTime();
    const entry = byUser.get(s.userId) ?? {
      userId: s.userId,
      name: s.user.name,
      loginId: s.user.loginId,
      role: s.user.role,
      totalMs: 0,
      sessionCount: 0,
    };
    entry.totalMs += Math.max(0, durationMs);
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
