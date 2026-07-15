import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deleteRoster, createRosterFromUpload } from "../lib/services/roster.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
};

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

  // Case 1: roster with no tournaments -> should delete cleanly, players cascade.
  await prisma.playerRoster.deleteMany({ where: { name: "Deletable Test Roster" } });
  const roster = await createRosterFromUpload(
    "Deletable Test Roster",
    [{ name: "Test Player A" }, { name: "Test Player B" }],
    admin.id
  );
  const playerCountBefore = await prisma.player.count({ where: { rosterId: roster.id } });
  assert(playerCountBefore === 2, "Roster created with 2 players");

  await deleteRoster(roster.id);
  const rosterAfter = await prisma.playerRoster.findUnique({ where: { id: roster.id } });
  assert(rosterAfter === null, "Unused roster was deleted");
  const playerCountAfter = await prisma.player.count({ where: { rosterId: roster.id } });
  assert(playerCountAfter === 0, "Players were cascade-deleted with the roster");

  // Case 2: roster used by a tournament -> should be blocked with a clear message.
  const demoTournament = await prisma.tournament.findFirstOrThrow({
    where: { name: "Demo Tournament" },
    include: { roster: true },
  });
  try {
    await deleteRoster(demoTournament.rosterId);
    throw new Error("Expected deleteRoster to reject a roster in use by a tournament");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("tournament"),
      `In-use roster deletion is blocked: ${e instanceof Error ? e.message : e}`
    );
  }
  const stillExists = await prisma.playerRoster.findUnique({ where: { id: demoTournament.rosterId } });
  assert(stillExists !== null, "In-use roster still exists after the blocked attempt");

  console.log("\nAll delete-roster assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
