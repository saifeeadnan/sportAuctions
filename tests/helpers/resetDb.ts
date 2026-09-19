import { prisma } from "@/lib/prisma";

// The table list is discovered once per process and reused — it can't
// legitimately change mid-run (migrations only ever run once, up front, via
// test:db:setup), so re-querying pg_tables on every single resetDb() call
// (hundreds of times across a full suite run) was pure round-trip waste.
let cachedTableList: string | null = null;

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

  if (cachedTableList === null) {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `;
    if (tables.length === 0) return;
    cachedTableList = tables.map((t) => `"${t.tablename}"`).join(", ");
  }

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${cachedTableList} RESTART IDENTITY CASCADE;`);
}
