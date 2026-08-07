import { prisma } from "@/lib/prisma";

/**
 * Wipes every table in the test database between tests. Rather than
 * hand-listing tables in FK-safe order (the one existing precedent,
 * scripts/restore-database.ts, turned out to already be stale — missing
 * every table added since, e.g. League, AnalyticsSession, TeamSponsorImage),
 * this discovers the current table list at runtime and lets Postgres's own
 * CASCADE handle ordering, so it never drifts out of sync with the schema
 * again.
 */
export async function resetDb() {
  // A wrong-database truncate would be catastrophic and silent — refuse to
  // run against anything that isn't unambiguously the test database, in case
  // tests/setupEnv.ts's .env.test override ever fails to apply for any reason.
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.includes("sportauction_test")) {
    throw new Error(
      `resetDb() refused to run — DATABASE_URL doesn't look like the test database: ${dbUrl}`
    );
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const tableList = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
}
