import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, openPreAuction, lockPreAuction } from "../lib/services/auction.service";
import { submitDraft } from "../lib/services/preAuctionDraft.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tournament = await prisma.tournament.findFirstOrThrow({
    where: { name: "Demo Tournament" },
    include: { teams: { orderBy: { name: "asc" } }, roster: { include: { players: { orderBy: { name: "asc" } } } } },
  });
  const players = tournament.roster.players;
  console.log(`Tournament: ${tournament.name}, teams: ${tournament.teams.map((t) => t.name).join(", ")}, players: ${players.length}`);

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: "Phase3 Verify Auction" } });

  const iconPlayers = players.slice(0, 5);
  const regularPlayers = players.slice(5);

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

  const auction = await createAuction({
    tournamentId: tournament.id,
    name: "Phase3 Verify Auction",
    teamBudget: 2000,
    createdById: admin.id,
    categories: [
      { name: "Icon", basePrice: 500 },
      { name: "Regular", basePrice: 100 },
    ],
    playerAssignments: [
      ...iconPlayers.map((p) => ({ playerId: p.id, categoryName: "Icon" })),
      ...regularPlayers.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    ],
  });
  console.log(`Created auction ${auction.id}`);

  await openPreAuction(auction.id);
  console.log("Opened pre-auction");

  const entries = await prisma.teamAuctionEntry.findMany({
    where: { auctionId: auction.id },
    include: { team: true },
  });
  for (const e of entries) {
    console.log(
      `  entry ${e.team.name}: budgetRemaining=${e.budgetRemaining} slotsFilled=${e.slotsFilled}/${e.slotsTotal} status=${e.status}`
    );
  }

  const entryByTeamName = new Map(entries.map((e) => [e.team.name, e]));
  const apByPlayerName = new Map(
    (
      await prisma.auctionPlayer.findMany({ where: { auctionId: auction.id }, include: { player: true } })
    ).map((ap) => [ap.player.name, ap])
  );

  const uniqueA = players[0].name;
  const uniqueB = players[1].name;
  const uniqueC = players[6].name;
  const contested = players[2].name;

  const e1 = entryByTeamName.get("Team 1")!;
  const e2 = entryByTeamName.get("Team 2")!;
  const e3 = entryByTeamName.get("Team 3")!;

  await submitDraft(e1.id, [apByPlayerName.get(uniqueA)!.id, apByPlayerName.get(contested)!.id]);
  await submitDraft(e2.id, [apByPlayerName.get(uniqueB)!.id, apByPlayerName.get(contested)!.id]);
  await submitDraft(e3.id, [apByPlayerName.get(uniqueC)!.id]);
  console.log("Submitted drafts for all 3 teams (Team1 & Team2 both drafted the contested player)");

  await lockPreAuction(auction.id, false);
  console.log("Locked pre-auction and resolved overlaps");

  const finalAuctionPlayers = await prisma.auctionPlayer.findMany({
    where: { auctionId: auction.id },
    include: { player: true, category: true, soldToEntry: { include: { team: true } } },
  });
  const finalEntries = await prisma.teamAuctionEntry.findMany({
    where: { auctionId: auction.id },
    include: { team: true },
  });

  console.log("\n--- Results ---");
  for (const name of [uniqueA, uniqueB, uniqueC, contested]) {
    const ap = finalAuctionPlayers.find((x) => x.player.name === name)!;
    console.log(
      `${name}: status=${ap.status} soldVia=${ap.soldVia ?? "-"} soldPrice=${ap.soldPrice ?? "-"} soldTo=${ap.soldToEntry?.team.name ?? "-"}`
    );
  }

  const untouchedSample = finalAuctionPlayers.find((ap) => ap.player.name === players[10].name)!;
  console.log(`${players[10].name} (never drafted): status=${untouchedSample.status}`);

  console.log("\n--- Team budgets ---");
  for (const e of finalEntries) {
    console.log(
      `${e.team.name}: budgetRemaining=${e.budgetRemaining} slotsFilled=${e.slotsFilled}/${e.slotsTotal} status=${e.status}`
    );
  }

  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
    console.log(`OK: ${msg}`);
  };

  const apA = finalAuctionPlayers.find((x) => x.player.name === uniqueA)!;
  const apB = finalAuctionPlayers.find((x) => x.player.name === uniqueB)!;
  const apC = finalAuctionPlayers.find((x) => x.player.name === uniqueC)!;
  const apContested = finalAuctionPlayers.find((x) => x.player.name === contested)!;

  assert(apA.status === "SOLD" && apA.soldVia === "PRE_AUCTION_DRAFT", `${uniqueA} auto-allocated`);
  assert(apA.soldToEntry?.team.name === "Team 1", `${uniqueA} allocated to Team 1`);
  assert(String(apA.soldPrice) === "500", `${uniqueA} sold at Icon base price 500`);

  assert(apB.status === "SOLD" && apB.soldToEntry?.team.name === "Team 2", `${uniqueB} allocated to Team 2`);
  assert(apC.status === "SOLD" && apC.soldToEntry?.team.name === "Team 3", `${uniqueC} allocated to Team 3`);
  assert(String(apC.soldPrice) === "100", `${uniqueC} sold at Regular base price 100`);

  assert(apContested.status === "IN_PRE_AUCTION_POOL", `${contested} sent to live auction pool (drafted by 2 teams)`);
  assert(untouchedSample.status === "AVAILABLE", `${players[10].name} remains AVAILABLE (never drafted)`);

  const finalE1 = finalEntries.find((e) => e.team.name === "Team 1")!;
  const finalE2 = finalEntries.find((e) => e.team.name === "Team 2")!;
  const finalE3 = finalEntries.find((e) => e.team.name === "Team 3")!;

  assert(String(finalE1.budgetRemaining) === "1450", `Team 1 budgetRemaining is 1450, got ${finalE1.budgetRemaining}`);
  assert(String(finalE2.budgetRemaining) === "1450", `Team 2 budgetRemaining is 1450, got ${finalE2.budgetRemaining}`);
  assert(String(finalE3.budgetRemaining) === "1850", `Team 3 budgetRemaining is 1850, got ${finalE3.budgetRemaining}`);

  assert(finalE1.slotsFilled === 2, `Team 1 slotsFilled is 2, got ${finalE1.slotsFilled}`);
  assert(finalE3.slotsFilled === 2, `Team 3 slotsFilled is 2, got ${finalE3.slotsFilled}`);

  assert(
    finalEntries.every((e) => e.status === "ALLOCATED_PRE_AUCTION"),
    "All entries transitioned to ALLOCATED_PRE_AUCTION"
  );

  console.log("\nAll assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
