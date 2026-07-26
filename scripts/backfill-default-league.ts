import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const LEAGUE_NAME = "BCC NJ Cricket league";
const LEAGUE_TYPE = "Cricket";

async function main() {
  let league = await prisma.league.findUnique({ where: { name: LEAGUE_NAME } });
  if (!league) {
    league = await prisma.league.create({ data: { name: LEAGUE_NAME, type: LEAGUE_TYPE } });
    console.log(`Created league "${league.name}" (${league.id})`);
  } else {
    console.log(`League "${league.name}" already exists (${league.id})`);
  }

  // leagueId is typed (and client-side validated) as required on PlayerRoster/
  // Tournament in the final schema, but this script's whole purpose is to run
  // in the window between migration 1 (nullable leagueId) and migration 2
  // (NOT NULL) — raw SQL sidesteps the generated client's now-stricter validation.
  const rosters = await prisma.$executeRawUnsafe(
    `UPDATE player_rosters SET "leagueId" = $1 WHERE "leagueId" IS NULL`,
    league.id
  );
  console.log(`Backfilled ${rosters} roster(s)`);

  const tournaments = await prisma.$executeRawUnsafe(
    `UPDATE tournaments SET "leagueId" = $1 WHERE "leagueId" IS NULL`,
    league.id
  );
  console.log(`Backfilled ${tournaments} tournament(s)`);

  const users = await prisma.user.updateMany({
    where: { role: { not: "ADMIN" }, leagueId: null },
    data: { leagueId: league.id },
  });
  console.log(`Backfilled ${users.count} non-admin user(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
