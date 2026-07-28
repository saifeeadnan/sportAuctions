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

export async function getLoginSummary(take = 50) {
  const [total, recent] = await Promise.all([
    prisma.loginEvent.count(),
    prisma.loginEvent.findMany({
      orderBy: { loginAt: "desc" },
      take,
      select: {
        id: true,
        loginAt: true,
        ipAddress: true,
        userAgent: true,
        user: { select: { id: true, name: true, loginId: true, role: true } },
      },
    }),
  ]);
  return { total, recent };
}

export async function getTimeSpentSummary() {
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

  return Array.from(byUser.values()).sort((a, b) => b.totalMs - a.totalMs);
}

export async function getSponsorClickSummary() {
  const grouped = await prisma.sponsorClickEvent.groupBy({
    by: ["sponsorId"],
    _count: { _all: true },
  });
  if (grouped.length === 0) return [];

  const sponsors = await prisma.tournamentSponsor.findMany({
    where: { id: { in: grouped.map((g) => g.sponsorId) } },
    select: { id: true, name: true, tournament: { select: { name: true } } },
  });
  const sponsorById = new Map(sponsors.map((s) => [s.id, s]));

  return grouped
    .map((g) => ({
      sponsorId: g.sponsorId,
      clicks: g._count._all,
      sponsorName: sponsorById.get(g.sponsorId)?.name ?? "(deleted sponsor)",
      tournamentName: sponsorById.get(g.sponsorId)?.tournament.name ?? null,
    }))
    .sort((a, b) => b.clicks - a.clicks);
}
