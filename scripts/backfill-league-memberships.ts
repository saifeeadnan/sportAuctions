import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import type { Role } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Phase 1 of the multi-league-users migration: copies every existing User's
 * role/leagueId/managerBasePrice/isActive into a LeagueMembership row, and
 * flags existing ADMIN users as isSiteAdmin. Already run against dev and
 * production — kept only as a historical record, same precedent as
 * scripts/backfill-default-league.ts. Reads/writes the doomed columns via
 * raw SQL (not the generated Prisma Client's typed API) since Migration B
 * drops role/leagueId/managerBasePrice from User entirely; re-running this
 * script after that point would find no matching rows and do nothing.
 */
async function main() {
  const nonAdminUsers = await prisma.$queryRawUnsafe<
    { id: string; leagueId: string; role: Role; managerBasePrice: string | null; isActive: boolean }[]
  >(`SELECT id, "leagueId", role, "managerBasePrice", "isActive" FROM users WHERE "leagueId" IS NOT NULL`);

  let created = 0;
  let updated = 0;
  for (const user of nonAdminUsers) {
    const existing = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: user.leagueId } },
    });
    await prisma.leagueMembership.upsert({
      where: { userId_leagueId: { userId: user.id, leagueId: user.leagueId } },
      create: {
        userId: user.id,
        leagueId: user.leagueId,
        role: user.role,
        managerBasePrice: user.managerBasePrice,
        isActive: user.isActive,
      },
      update: {
        role: user.role,
        managerBasePrice: user.managerBasePrice,
        isActive: user.isActive,
      },
    });
    if (existing) updated += 1;
    else created += 1;
  }

  const membershipCount = await prisma.leagueMembership.count();
  console.log(
    `Backfilled ${created} new membership row(s), refreshed ${updated} existing one(s) (${membershipCount} total in table)`
  );

  const adminsFlagged = await prisma.$executeRawUnsafe(
    `UPDATE users SET "isSiteAdmin" = true WHERE role = 'ADMIN' AND "isSiteAdmin" = false`
  );
  console.log(`Flagged ${adminsFlagged} existing ADMIN user(s) as isSiteAdmin`);

  const expected = nonAdminUsers.length;
  console.log(
    `Sanity check: ${expected} User row(s) with a non-null leagueId, ${membershipCount} LeagueMembership row(s) total.`
  );
  if (expected !== membershipCount) {
    console.warn(
      "Counts don't match exactly — expected if this script has been run before against a DB with pre-existing memberships, otherwise investigate before proceeding."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
