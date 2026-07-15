import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const DATE_FIELDS = ["createdAt", "startDate", "endDate", "startedAt", "completedAt", "soldAt"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reviveDates(records: any[]): any[] {
  return records.map((record) => {
    const copy = { ...record };
    for (const field of DATE_FIELDS) {
      if (field in copy && copy[field] != null) {
        copy[field] = new Date(copy[field]);
      }
    }
    return copy;
  });
}

async function main() {
  const file = path.join(__dirname, "..", "backups", "latest.json");
  if (!fs.existsSync(file)) {
    console.error(
      `No backup found at ${file}. Run "npx tsx scripts/backup-database.ts" first, or fall back to "npx prisma db seed".`
    );
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(file, "utf-8"));
  console.log(`Restoring backup from ${backup.createdAt}`);

  // Clear any existing data first (children before parents) so this is safe to re-run
  // against a freshly-pushed, empty schema or one that already has seed data in it.
  await prisma.preAuctionSubmission.deleteMany();
  await prisma.auctionPlayer.deleteMany();
  await prisma.teamAuctionEntry.deleteMany();
  await prisma.auctionCategory.deleteMany();
  await prisma.auction.deleteMany();
  await prisma.team.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.player.deleteMany();
  await prisma.playerRoster.deleteMany();
  await prisma.user.deleteMany();

  // Insert parents before children so every foreign key is already satisfied.
  const steps: [string, () => Promise<unknown>][] = [
    ["users", () => prisma.user.createMany({ data: reviveDates(backup.users) })],
    ["playerRosters", () => prisma.playerRoster.createMany({ data: reviveDates(backup.playerRosters) })],
    ["players", () => prisma.player.createMany({ data: reviveDates(backup.players) })],
    ["tournaments", () => prisma.tournament.createMany({ data: reviveDates(backup.tournaments) })],
    ["teams", () => prisma.team.createMany({ data: reviveDates(backup.teams) })],
    ["auctions", () => prisma.auction.createMany({ data: reviveDates(backup.auctions) })],
    ["auctionCategories", () => prisma.auctionCategory.createMany({ data: reviveDates(backup.auctionCategories) })],
    ["teamAuctionEntries", () => prisma.teamAuctionEntry.createMany({ data: reviveDates(backup.teamAuctionEntries) })],
    ["auctionPlayers", () => prisma.auctionPlayer.createMany({ data: reviveDates(backup.auctionPlayers) })],
    ["preAuctionSubmissions", () => prisma.preAuctionSubmission.createMany({ data: reviveDates(backup.preAuctionSubmissions) })],
  ];

  for (const [name, run] of steps) {
    const records = backup[name as keyof typeof backup] as unknown[];
    if (Array.isArray(records) && records.length > 0) {
      await run();
      console.log(`Restored ${records.length} ${name}`);
    }
  }

  console.log("Restore complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
