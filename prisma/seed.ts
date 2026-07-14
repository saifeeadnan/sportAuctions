import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function upsertUser(
  email: string,
  name: string,
  role: "ADMIN" | "TEAM_MANAGER" | "AUCTIONEER" | "VIEWER",
  password: string,
  managerBasePrice?: number
) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash, managerBasePrice },
  });
}

const SAMPLE_PLAYERS = [
  { name: "Virat Kohli", position: "Batsman", age: 35, rating: 95 },
  { name: "Jasprit Bumrah", position: "Bowler", age: 30, rating: 92 },
  { name: "MS Dhoni", position: "Wicketkeeper", age: 42, rating: 90 },
  { name: "Rohit Sharma", position: "Batsman", age: 37, rating: 88 },
  { name: "Ravindra Jadeja", position: "All-rounder", age: 35, rating: 85 },
  { name: "KL Rahul", position: "Batsman", age: 32, rating: 82 },
  { name: "Mohammed Shami", position: "Bowler", age: 34, rating: 80 },
  { name: "Rishabh Pant", position: "Wicketkeeper", age: 27, rating: 78 },
  { name: "Hardik Pandya", position: "All-rounder", age: 31, rating: 84 },
  { name: "Shubman Gill", position: "Batsman", age: 25, rating: 79 },
  { name: "Yuzvendra Chahal", position: "Bowler", age: 34, rating: 74 },
  { name: "Suryakumar Yadav", position: "Batsman", age: 34, rating: 81 },
  { name: "Axar Patel", position: "All-rounder", age: 31, rating: 72 },
  { name: "Mohammed Siraj", position: "Bowler", age: 31, rating: 76 },
  { name: "Ishan Kishan", position: "Wicketkeeper", age: 26, rating: 70 },
];

async function main() {
  const admin = await upsertUser(
    "admin@sportsauction.local",
    "Admin",
    "ADMIN",
    "admin123"
  );
  console.log(`Admin: ${admin.email} (password: admin123)`);

  const managers = await Promise.all([
    upsertUser("manager1@sportsauction.local", "Manager One", "TEAM_MANAGER", "manager123", 50),
    upsertUser("manager2@sportsauction.local", "Manager Two", "TEAM_MANAGER", "manager123", 50),
    upsertUser("manager3@sportsauction.local", "Manager Three", "TEAM_MANAGER", "manager123", 50),
  ]);
  console.log(`Managers: ${managers.map((m) => m.email).join(", ")} (password: manager123)`);

  const auctioneer = await upsertUser(
    "auctioneer1@sportsauction.local",
    "Auctioneer One",
    "AUCTIONEER",
    "auction123"
  );
  console.log(`Auctioneer: ${auctioneer.email} (password: auction123)`);

  const viewer = await upsertUser(
    "viewer1@sportsauction.local",
    "Viewer One",
    "VIEWER",
    "viewer123"
  );
  console.log(`Viewer: ${viewer.email} (password: viewer123)`);

  let roster = await prisma.playerRoster.findFirst({ where: { name: "Demo Season Roster" } });
  if (!roster) {
    roster = await prisma.playerRoster.create({
      data: { name: "Demo Season Roster", createdById: admin.id },
    });
    await prisma.player.createMany({
      data: SAMPLE_PLAYERS.map((p) => ({ ...p, rosterId: roster!.id })),
    });
    console.log(`Created roster "Demo Season Roster" with ${SAMPLE_PLAYERS.length} players`);
  } else {
    console.log(`Roster "Demo Season Roster" already exists`);
  }

  let tournament = await prisma.tournament.findFirst({ where: { name: "Demo Tournament" } });
  if (!tournament) {
    tournament = await prisma.tournament.create({
      data: {
        name: "Demo Tournament",
        rosterId: roster.id,
        numTeams: 3,
        squadSize: 5,
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-10"),
        createdById: admin.id,
      },
    });
    console.log(`Created tournament "Demo Tournament"`);

    await prisma.team.createMany({
      data: managers.map((manager, i) => ({
        tournamentId: tournament!.id,
        name: `Team ${i + 1}`,
        managerId: manager.id,
        managerOccupiesSlot: true,
      })),
    });
    console.log(`Created 3 teams under "Demo Tournament"`);
  } else {
    console.log(`Tournament "Demo Tournament" already exists`);
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
