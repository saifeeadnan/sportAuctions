import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { findManagerSelfAuctionPlayerId, submitDraft } from "../lib/services/preAuctionDraft.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
};

async function main() {
  const warriors = await prisma.team.findFirstOrThrow({
    where: { name: "Warriors", tournament: { name: "BCC 2026" } },
    include: { manager: true },
  });
  assert(warriors.manager?.loginId === "adnan.saifee", "Warriors is managed by adnan.saifee");

  const entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { teamId: warriors.id, auction: { name: "Auction Test" } },
  });
  assert(entry.status === "PRE_AUCTION_DRAFTING", "Entry is in PRE_AUCTION_DRAFTING");

  const selfId = await findManagerSelfAuctionPlayerId(entry.auctionId, warriors.managerId!);
  assert(selfId !== null, "findManagerSelfAuctionPlayerId finds Adnan Saifee's own AuctionPlayer");

  const selfAuctionPlayer = await prisma.auctionPlayer.findUniqueOrThrow({
    where: { id: selfId! },
    include: { player: true },
  });
  assert(selfAuctionPlayer.player.name === "Adnan Saifee", "The matched player is Adnan Saifee");

  // Pick one other available player for a realistic mixed submission.
  const otherPlayer = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: entry.auctionId, status: "AVAILABLE", id: { not: selfId! } },
  });

  // Simulate the manager submitting a draft WITHOUT including themselves
  // (e.g. bypassing the disabled checkbox by calling the action directly).
  await submitDraft(entry.id, [otherPlayer.id]);

  const submissions = await prisma.preAuctionSubmission.findMany({
    where: { teamAuctionEntryId: entry.id },
  });
  const submittedIds = submissions.map((s) => s.auctionPlayerId);

  assert(
    submittedIds.includes(selfId!),
    "Server force-includes the manager's own player even when omitted from the submitted list"
  );
  assert(submittedIds.includes(otherPlayer.id), "The explicitly selected player is also included");
  assert(submittedIds.length === 2, `Exactly 2 picks recorded (self + 1 other), got ${submittedIds.length}`);

  // Now simulate trying to submit an EMPTY list (fully "unselecting" everyone) -> self must still remain.
  await submitDraft(entry.id, []);
  const submissions2 = await prisma.preAuctionSubmission.findMany({
    where: { teamAuctionEntryId: entry.id },
  });
  assert(
    submissions2.length === 1 && submissions2[0].auctionPlayerId === selfId,
    "Submitting an empty list still leaves the manager's own player locked in"
  );

  console.log("\nAll manager-self-lock assertions passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
