// Seeds each of the 10 managers' own Strategy (must-haves, avoids, budget
// targets per category) in the "IPL 2027 Mini Auction" — see
// TEAM_STRATEGIES in mock-ipl2027-data.ts for what each team's picks are and
// why. Run this after mock-ipl2027-mini-auction.ts has created the auction.
// Idempotent: saveStrategy is itself wipe-and-replace per entry, so re-running
// this just re-applies the same TEAM_STRATEGIES content.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { saveStrategy } from "../lib/services/auctionStrategy.service";
import { MINI_AUCTION_NAME, TEAM_STRATEGIES, TEAMS } from "./mock-ipl2027-data";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const auction = await prisma.auction.findFirstOrThrow({ where: { name: MINI_AUCTION_NAME } });
  const admin = await prisma.user.findFirstOrThrow({ where: { isSiteAdmin: true } });

  const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id }, include: { team: true } });
  const entryBySlug = new Map(TEAMS.map((t) => [t.slug, entries.find((e) => e.team.name === t.name)!]));

  const categories = await prisma.auctionCategory.findMany({ where: { auctionId: auction.id } });
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

  for (const strategy of TEAM_STRATEGIES) {
    const entry = entryBySlug.get(strategy.teamSlug)!;

    const wantedNames = [...strategy.mustHaveNames, ...strategy.avoidNames];
    const auctionPlayers = await prisma.auctionPlayer.findMany({
      where: { auctionId: auction.id, player: { name: { in: wantedNames } } },
      include: { player: true },
    });
    const auctionPlayerIdByName = new Map(auctionPlayers.map((p) => [p.player.name, p.id]));

    const missing = wantedNames.filter((name) => !auctionPlayerIdByName.has(name));
    if (missing.length > 0) {
      throw new Error(`${strategy.teamSlug}: missing AuctionPlayer for ${missing.join(", ")}`);
    }

    const mustHaveIds = strategy.mustHaveNames.map((name) => auctionPlayerIdByName.get(name)!);
    const avoidIds = strategy.avoidNames.map((name) => auctionPlayerIdByName.get(name)!);
    const budgetTargets = Object.entries(strategy.budgetTargetsByCategory).map(([categoryName, targetAvgPrice]) => {
      const categoryId = categoryIdByName.get(categoryName);
      if (!categoryId) throw new Error(`${strategy.teamSlug}: unknown category "${categoryName}"`);
      return { categoryId, targetAvgPrice };
    });

    await saveStrategy(entry.id, mustHaveIds, avoidIds, budgetTargets, admin.id);
    console.log(
      `${strategy.teamSlug.toUpperCase()}: strategy saved (${mustHaveIds.length} must-haves, ${avoidIds.length} avoids, ${budgetTargets.length} budget targets)`
    );
  }

  console.log(`\nStrategy seeded for all ${TEAM_STRATEGIES.length} teams.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
