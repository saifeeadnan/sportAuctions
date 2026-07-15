import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const backup = {
    createdAt: new Date().toISOString(),
    users: await prisma.user.findMany(),
    playerRosters: await prisma.playerRoster.findMany(),
    players: await prisma.player.findMany(),
    tournaments: await prisma.tournament.findMany(),
    teams: await prisma.team.findMany(),
    auctions: await prisma.auction.findMany(),
    auctionCategories: await prisma.auctionCategory.findMany(),
    teamAuctionEntries: await prisma.teamAuctionEntry.findMany(),
    auctionPlayers: await prisma.auctionPlayer.findMany(),
    preAuctionSubmissions: await prisma.preAuctionSubmission.findMany(),
  };

  const dir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });

  const timestamped = path.join(dir, `backup-${Date.now()}.json`);
  const latest = path.join(dir, "latest.json");
  const json = JSON.stringify(backup, null, 2);
  fs.writeFileSync(timestamped, json);
  fs.writeFileSync(latest, json);

  const counts = Object.fromEntries(
    Object.entries(backup)
      .filter(([k]) => k !== "createdAt")
      .map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
  );
  console.log(`Backup written to ${latest}`);
  console.log("Row counts:", counts);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
