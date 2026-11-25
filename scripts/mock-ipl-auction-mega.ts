// The "mega" mock auction: ~350-player pool, every team's real pre-auction
// retention (RETAINED_PLAYERS), KKR's scripted Venkatesh-Iyer-style
// overspend bind, two real-confirmed 2025 outcomes (Pant->LSG, Shreyas
// Iyer->Punjab), and every team's own researched Strategy profile. See the
// plan at C:\Users\adnan\.claude\plans\i-want-to-build-snazzy-noodle.md for
// the full numbers/rationale. Idempotent: deletes-then-recreates this one
// named auction, same pattern as scripts/setup-live-view-test.ts.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuction, startBiddingDirect } from "../lib/services/auction.service";
import { adminAssignPlayer } from "../lib/services/bidding.service";
import { saveStrategy } from "../lib/services/auctionStrategy.service";
import { upsertRivalCategoryEstimate } from "../lib/services/rivalCategoryEstimate.service";
import { savePrediction } from "../lib/services/auctionPrediction.service";
import { setAnalyticsEnabled } from "../lib/services/auctionAnalyticsEntitlement.service";
import { CATEGORIES, GUARANTEED_MEGA_NAMES, MEGA_AUCTION_NAME, RETAINED_NAMES, RETAINED_PLAYERS, TEAMS, TOURNAMENT_NAME } from "./mock-ipl-data";
import { mulberry32, randomlySellPlayers, splitPoolForAuctions } from "./mock-ipl-helpers";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const TEAM_BUDGET = 12000;

// Players reserved as a specific team's live must-have target — excluded
// from the generic random-fill sales so they stay AVAILABLE for Strategy
// data below to reference meaningfully. None of these are ever in
// RETAINED_PLAYERS — every name here is a genuine 2025 auction buy.
const RESERVED_MUST_HAVE_NAMES = new Set([
  "Mitchell Starc",
  "Arshdeep Singh", // KKR
  "Devon Conway",
  "R Ashwin", // CSK
  "Bhuvneshwar Kumar",
  "Josh Hazlewood", // RCB
  "Jofra Archer", // RR
  "Jos Buttler", // GT
  "KL Rahul", // MI (opener-type) — LSG's real headline release, genuinely available
  "Glenn Maxwell", // SRH (finisher-type)
  "Yuzvendra Chahal", // KKR's price-only prediction target
]);

async function main() {
  const tournament = await prisma.tournament.findFirstOrThrow({
    where: { name: TOURNAMENT_NAME },
    include: { roster: { include: { players: true } } },
  });
  if (!tournament.roster) throw new Error(`${TOURNAMENT_NAME} has no roster attached`);
  const admin = await prisma.user.findFirstOrThrow({ where: { isSiteAdmin: true } });

  await prisma.auction.deleteMany({ where: { tournamentId: tournament.id, name: MEGA_AUCTION_NAME } });

  const { megaPool } = splitPoolForAuctions(tournament.roster.players, GUARANTEED_MEGA_NAMES, RETAINED_NAMES);

  const auction = await createAuction({
    tournamentId: tournament.id,
    name: MEGA_AUCTION_NAME,
    teamBudget: TEAM_BUDGET,
    createdById: admin.id,
    skipPreAuctionDraft: true,
    categories: CATEGORIES.map((c) => ({ name: c.name, basePrice: c.basePrice, bidIncrement: c.bidIncrement })),
    playerAssignments: megaPool.map((p) => ({ playerId: p.id, categoryName: (p as { defaultCategory: string | null }).defaultCategory! })),
  });
  console.log(`Created auction "${MEGA_AUCTION_NAME}" (${megaPool.length} players)`);

  await startBiddingDirect(auction.id, admin.id);

  const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id }, include: { team: true } });
  const entryByTeamName = new Map(entries.map((e) => [e.team.name, e]));
  const entryBySlug = new Map(TEAMS.map((t) => [t.slug, entryByTeamName.get(t.name)!]));

  const dbCategories = await prisma.auctionCategory.findMany({ where: { auctionId: auction.id } });
  const categoryIdByName = new Map(dbCategories.map((c) => [c.name, c.id]));

  async function findAuctionPlayer(name: string, requireAvailable: boolean) {
    return prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, player: { name }, ...(requireAvailable ? { status: "AVAILABLE" } : {}) },
    });
  }

  // --- Every team's real pre-auction retention, assigned before any other
  // sale — real IPL retention happens before the auction even opens, so
  // this always runs first, against the full-budget/zero-slots-filled
  // starting state. ---
  for (const r of RETAINED_PLAYERS) {
    const entry = entryBySlug.get(r.teamSlug)!;
    const auctionPlayer = await findAuctionPlayer(r.name, true);
    await adminAssignPlayer(auction.id, auctionPlayer.id, entry.id, r.costLakh, admin.id);
  }
  console.log(`Retention: ${RETAINED_PLAYERS.length} players assigned to their real 2025 teams`);

  const kkrEntry = entryBySlug.get("kkr")!;
  const lsgEntry = entryBySlug.get("lsg")!;
  const pbksEntry = entryBySlug.get("pbks")!;
  const rng = mulberry32(20251124);

  // --- KKR's scripted overspend sequence (the plan's core scenario). After
  // its own 6-player retention (budgetRemaining=5100L, slotsFilled=6/20),
  // 3 more non-marquee picks (1700L) + Venkatesh Iyer as the 10th pick
  // (2375L, the real 8cr->23.75cr jump scaled 1:1) leaves budgetRemaining
  // ~1025L for the 10 remaining slots — a stark squeeze next to any
  // prudent rival's post-retention budget/slot ratio.
  const kkrExclude = new Set([...RESERVED_MUST_HAVE_NAMES, "Venkatesh Iyer", "Rishabh Pant", "Shreyas Iyer"]);
  let kkrSpent = 0;
  const kkrNextPrices = [600, 550, 550]; // sums to 1700L
  for (const price of kkrNextPrices) {
    const candidate = await prisma.auctionPlayer.findFirstOrThrow({
      where: {
        auctionId: auction.id,
        status: "AVAILABLE",
        category: { name: { not: "Marquee" } },
        player: { name: { notIn: Array.from(kkrExclude) } },
      },
    });
    await adminAssignPlayer(auction.id, candidate.id, kkrEntry.id, price, admin.id);
    kkrSpent += price;
  }
  console.log(`KKR: 3 more picks totaling ${kkrSpent}L (post-retention)`);

  const venkateshIyer = await findAuctionPlayer("Venkatesh Iyer", true);
  await adminAssignPlayer(auction.id, venkateshIyer.id, kkrEntry.id, 2375, admin.id);
  console.log("KKR: Venkatesh Iyer at 2375L (the scripted overspend — real 8cr->23.75cr jump, scaled 1:1)");

  // --- Real confirmed 2025 outcomes, anchoring LSG/Punjab's own strategy ---
  const pant = await findAuctionPlayer("Rishabh Pant", true);
  await adminAssignPlayer(auction.id, pant.id, lsgEntry.id, 2700, admin.id);
  const shreyasIyer = await findAuctionPlayer("Shreyas Iyer", true);
  await adminAssignPlayer(auction.id, shreyasIyer.id, pbksEntry.id, 2675, admin.id);
  console.log("LSG: Rishabh Pant at 2700L; Punjab Kings: Shreyas Iyer at 2675L");

  // --- Generic fill: every other team tops up from its own post-retention
  // state toward ~9/20 filled (KKR, the headline scenario, ends at 10/20).
  // None of this touches a RESERVED_MUST_HAVE_NAMES player, so every team's
  // own Strategy target stays live/AVAILABLE.
  const genericFillCounts: Record<string, number> = {
    lsg: 3,
    pbks: 6,
    mi: 4,
    csk: 4,
    rcb: 6,
    dc: 5,
    rr: 3,
    srh: 4,
    gt: 4,
  };
  for (const [slug, count] of Object.entries(genericFillCounts)) {
    const entry = entryBySlug.get(slug)!;
    const sold = await randomlySellPlayers(prisma, auction.id, entry.id, admin.id, count, rng, { excludeNames: RESERVED_MUST_HAVE_NAMES });
    console.log(`${slug.toUpperCase()}: ${sold} generic sales`);
  }

  // --- KKR's own Strategy / Predictions / Rival estimates (the richer,
  // two-scenario self profile from the plan) ---
  const starc = await findAuctionPlayer("Mitchell Starc", true);
  const arshdeep = await findAuctionPlayer("Arshdeep Singh", true);
  const avoid1 = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, status: "AVAILABLE", player: { name: { notIn: Array.from(RESERVED_MUST_HAVE_NAMES) } } },
  });
  const avoid2 = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, status: "AVAILABLE", id: { not: avoid1.id }, player: { name: { notIn: Array.from(RESERVED_MUST_HAVE_NAMES) } } },
  });
  await saveStrategy(
    kkrEntry.id,
    [starc.id, arshdeep.id],
    [avoid1.id, avoid2.id],
    [{ categoryId: categoryIdByName.get("B-Tier")!, targetAvgPrice: 60 }],
    admin.id
  );
  console.log("KKR: strategy saved (must-haves Starc+Arshdeep, 2 avoids, tight B-Tier target)");

  const miRivalEntry = entryBySlug.get("mi")!;
  const cskRivalEntry = entryBySlug.get("csk")!;
  const rcbRivalEntry = entryBySlug.get("rcb")!;
  const gtRivalEntry = entryBySlug.get("gt")!;
  await upsertRivalCategoryEstimate(kkrEntry.id, miRivalEntry.id, categoryIdByName.get("Marquee")!, 200, admin.id);
  await upsertRivalCategoryEstimate(kkrEntry.id, cskRivalEntry.id, categoryIdByName.get("Elite")!, 5000, admin.id);
  await upsertRivalCategoryEstimate(kkrEntry.id, rcbRivalEntry.id, categoryIdByName.get("A-Tier")!, 2000, admin.id);
  // Deliberately leaving Gujarat Titans' estimate unset — exercises the
  // "no estimate on file" path.
  console.log("KKR: 3 rival category estimates saved (one left unestimated: GT)");

  const buttler = await findAuctionPlayer("Jos Buttler", true); // GT's own real target
  await savePrediction(kkrEntry.id, buttler.id, gtRivalEntry.id, 1800, null, false, admin.id);
  const chahal = await findAuctionPlayer("Yuzvendra Chahal", true);
  await savePrediction(kkrEntry.id, chahal.id, null, 180, null, false, admin.id); // price-only, no team guess
  const archer = await findAuctionPlayer("Jofra Archer", true); // RR's own real target
  await savePrediction(kkrEntry.id, archer.id, null, 1400, 1000, false, admin.id); // min+max, no team guess
  console.log("KKR: 3 predictions saved (team+amount, price-only, min+max)");

  // --- Every other team's own researched Strategy profile (mega only) ---
  const conway = await findAuctionPlayer("Devon Conway", true);
  const ashwin = await findAuctionPlayer("R Ashwin", true);
  await saveStrategy(cskRivalEntry.id, [conway.id, ashwin.id], [], [], admin.id);

  const bhuvi = await findAuctionPlayer("Bhuvneshwar Kumar", true);
  const hazlewood = await findAuctionPlayer("Josh Hazlewood", true);
  const flashyBatterToAvoid = await prisma.auctionPlayer.findFirstOrThrow({
    where: {
      auctionId: auction.id,
      status: "AVAILABLE",
      id: { notIn: [avoid1.id, avoid2.id] },
      player: { name: { notIn: Array.from(RESERVED_MUST_HAVE_NAMES) } },
    },
  });
  await saveStrategy(rcbRivalEntry.id, [bhuvi.id, hazlewood.id], [flashyBatterToAvoid.id], [], admin.id);

  const klRahul = await findAuctionPlayer("KL Rahul", true);
  await saveStrategy(miRivalEntry.id, [klRahul.id], [], [{ categoryId: categoryIdByName.get("A-Tier")!, targetAvgPrice: 80 }], admin.id);

  const rrEntry = entryBySlug.get("rr")!;
  await saveStrategy(rrEntry.id, [archer.id], [], [{ categoryId: categoryIdByName.get("B-Tier")!, targetAvgPrice: 70 }], admin.id);

  const srhEntry = entryBySlug.get("srh")!;
  const maxwell = await findAuctionPlayer("Glenn Maxwell", true);
  await saveStrategy(srhEntry.id, [maxwell.id], [], [], admin.id);

  // LSG and Punjab's "must-have" is already SOLD to themselves (Pant,
  // Shreyas Iyer) — still a valid tag, resolves as already-WON rather than
  // a live contest (see wishlistFeasibility's WON/LOST/AVAILABLE statuses).
  const pantPlayer = await findAuctionPlayer("Rishabh Pant", false);
  await saveStrategy(lsgEntry.id, [pantPlayer.id], [], [], admin.id);
  const shreyasIyerPlayer = await findAuctionPlayer("Shreyas Iyer", false);
  await saveStrategy(pbksEntry.id, [shreyasIyerPlayer.id], [], [], admin.id);

  await saveStrategy(gtRivalEntry.id, [buttler.id], [], [], admin.id);

  // Delhi Capitals: deliberately no strategy — no reliable documented
  // 2025-specific target was found (see the plan's per-team table).
  console.log("Strategy saved for 8 of 10 teams (DC left blank, per research)");

  // --- analyticsEnabled for all 10, so any mock login can open Analytics v2 ---
  for (const entry of entries) {
    await setAnalyticsEnabled(entry.id, true, admin.id);
  }
  console.log("analyticsEnabled set for all 10 entries");

  console.log(`\nMega auction ready. auctionId=${auction.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
