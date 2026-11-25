// Data for the "IPL 2027 Mock Season" — grounded in the REAL Dec 16, 2026
// mini auction (BCCI/IPL brand it "IPL 2027" for the season it stocks, same
// convention as the real "IPL 2026 auction" having happened Dec 2025 — see
// the plan file for the full research trail/sources). Built in real passes,
// all zero-invented-data:
// 1. ROSTER_PLAYERS (184 players): every team's COMPLETE real current roster
//    — confirmed via the official iplt20.com retention announcement
//    (https://www.iplt20.com/news/article/tata-ipl-2027-player-retentions-announced),
//    cross-checked against mykhel.com's independent consolidated list. Name
//    counts match the real per-team totals exactly. Includes the 14 real
//    Dec 2026 trades (tagged `source: "trade"`) and a handful of players
//    whose team changed via an earlier, already-settled trade before this
//    cycle (e.g. Sanju Samson to CSK, Ravindra Jadeja to RR, Ravi Bishnoi to
//    RR — all confirmed via a follow-up search, not assumed).
// 2. OPEN_POOL_PLAYERS (76 players): real, named, registered-for-auction
//    players across the 5 base-price tiers a cricket news source
//    (cricketaddictor.com, sourced from the official BCCI register)
//    published in full. 1,220 players registered total — these 76 are just
//    the top 5 of however many tiers exist below them, which weren't
//    published with full name lists.
//
// Reuses TEAMS (slugs/names/logos unchanged) from the 2025-cycle module.
// This cycle's own category ladder (MINI_AUCTION_CATEGORIES, below) is used
// for everything auction-related instead of the 2025 CATEGORIES module.
import { TEAMS } from "./mock-ipl-data";

export { TEAMS };

export const TOURNAMENT_NAME = "IPL 2027 Mock Season";
export const ROSTER_NAME = "IPL 2027 Mock Player Pool";
// Not calling this an "auction" in the UI-facing name — mechanically it must
// be one Auction row (this app has no "roster without an auction" concept),
// but no bidding happens on anything here: every player is admin-assigned at
// start, and there are deliberately zero AVAILABLE lots (the real open-
// auction pool isn't published yet — see the plan file's "Open design
// question" and the mega/mini scripts for what adding the real pool later
// should look like).
/** ONE unified auction — a team's existing roster (retentions + trades) and
 * the live mini-auction pool are the SAME squad, not two separate things
 * (caught by the user: splitting them into two Auction rows meant a team's
 * slotsFilled/budgetRemaining in the live auction didn't account for players
 * they already had). ROSTER_PLAYERS below are admin-assigned (SOLD) at this
 * auction's start; OPEN_POOL_PLAYERS are left AVAILABLE — one auction, one
 * consistent squad view. */
export const MINI_AUCTION_NAME = "IPL 2027 Mini Auction";

export const SQUAD_SIZE = 25; // real reported max squad size this cycle — confirmed: every
// team's (current roster + open slots) in the official iplt20.com snapshot sums to exactly 25.

// This app's Auction.teamBudget is ONE uniform number shared by every team
// at creation (confirmed directly against lib/services/auction.service.ts —
// createAuction takes a single teamBudget, and the only post-creation
// adjustment path, updateAuctionTeamSettings, applies one uniform delta to
// every team, by design: "there's no per-team spend history to preserve").
// So a team's REAL reported remaining purse (see REAL_REMAINING_PURSE_LAKH
// below) can't be set as each team's literal starting budget — the real
// figure also only covers the *open-auction* portion of each team's season,
// not what they've already spent on the retained/traded players below, so
// using it directly would double-count anyway. Instead every team starts
// from the same normalized TEAM_BUDGET, sized comfortably above the
// costliest team's known real spend (Mumbai Indians: 7500L across 5
// players) PLUS enough headroom left over for real live bidding against the
// open pool below — reusing the 2025 mega auction's own scale (12000L) for
// that reason. The resulting budgetRemaining per team will NOT equal their
// real reported remaining purse — that real figure is kept separately below
// purely for reference/display, not as live budget state.
export const TEAM_BUDGET = 12000;

/** Merged real base-price ladder for this cycle: the 5 tiers confirmed by
 * cricketaddictor.com (sourced from the official BCCI auction register) —
 * https://cricketaddictor.com/cricket-news/ipl-2027-full-list-of-registered-players-ben-stokes-and-shai-hope-among-big-names-466419/
 * — merged with the 2025-cycle ladder's remaining lower tiers (C-Tier down
 * to Uncapped), reused here only because ROSTER_PLAYERS' categories below
 * were assigned from that ladder before this cycle's own tiers were found,
 * and every tier name they share (Marquee/Elite/A-Tier/B-Tier) has the
 * IDENTICAL basePrice in both ladders — no conflict, nothing invented twice.
 * "Premium" (₹1.25cr) is the one real tier this cycle has that the 2025
 * ladder didn't, sitting between Elite (150L) and A-Tier (100L). The lower
 * tiers (C-Tier and below) have no real players in them this cycle — only
 * carried forward so mock-ipl-data.ts's E-Tier/Uncapped category names used
 * on a couple of ROSTER_PLAYERS entries (traded-in squad players, not pool
 * players) keep resolving to a valid category. */
export const MINI_AUCTION_CATEGORIES = [
  { name: "Marquee", basePrice: 200, bidIncrement: 50 },
  { name: "Elite", basePrice: 150, bidIncrement: 25 },
  { name: "Premium", basePrice: 125, bidIncrement: 25 },
  { name: "A-Tier", basePrice: 100, bidIncrement: 25 },
  { name: "B-Tier", basePrice: 75, bidIncrement: 10 },
  { name: "C-Tier", basePrice: 50, bidIncrement: 10 },
  { name: "D-Tier", basePrice: 40, bidIncrement: 10 },
  { name: "E-Tier", basePrice: 30, bidIncrement: 5 },
  { name: "Uncapped", basePrice: 20, bidIncrement: 5 },
];

/** Each team's REAL reported remaining purse for the open-auction portion of
 * this cycle (crore converted to lakh), for reference/display only — NOT
 * used as the mock auction's actual budget (see TEAM_BUDGET above for why).
 * SOURCE (authoritative, supersedes earlier estimates from secondary
 * sources): the official iplt20.com article "1,220 players feature on
 * Auction Register for TATA IPL 2027 Player Auction" —
 * https://www.iplt20.com/news/article/1-220-players-feature-on-auction-register-for-tata-ipl-2027-player-auction
 * This also confirmed PBKS's figure (18.60cr) exactly matches what had been
 * DERIVED here as an estimate before this article was found, and resolved
 * the earlier SRH conflict (40.15cr, not 35.15cr) in favor of what was
 * already chosen. MI's figure changed from an earlier secondary-source
 * estimate (32.60cr) to this article's 30.25cr.
 */
export const REAL_REMAINING_PURSE_LAKH: Record<string, number> = {
  lsg: 4745,
  kkr: 4165,
  dc: 3950,
  srh: 4015,
  csk: 2805,
  rr: 2705,
  mi: 3025,
  rcb: 1415,
  gt: 875,
  pbks: 1860,
};

/** Official per-team snapshot from the same iplt20.com article as above —
 * each team's REAL current roster size and overseas-player count (not just
 * the handful we have individual names for), and confirms every team's
 * (players + openSlots) sums to exactly 25 — i.e. SQUAD_SIZE=25 above is the
 * real, confirmed target for every team, not an approximation. spentCr is
 * each team's real total spend so far on their current roster (aggregate
 * only, not broken out per player). The article states the final Auction
 * List / player sets (the actual pool that goes under the hammer) releases
 * Friday, Dec 4, 2026 — re-check this source then for the real pool. */
export const OFFICIAL_TEAM_SNAPSHOT: Record<
  string,
  { players: number; overseas: number; spentCr: number; openSlots: number; overseasSlots: number }
> = {
  csk: { players: 19, overseas: 6, spentCr: 101.95, openSlots: 6, overseasSlots: 2 },
  dc: { players: 16, overseas: 4, spentCr: 90.5, openSlots: 9, overseasSlots: 4 },
  gt: { players: 22, overseas: 6, spentCr: 121.25, openSlots: 3, overseasSlots: 2 },
  kkr: { players: 17, overseas: 5, spentCr: 88.35, openSlots: 8, overseasSlots: 3 },
  lsg: { players: 18, overseas: 5, spentCr: 82.55, openSlots: 7, overseasSlots: 3 },
  mi: { players: 16, overseas: 6, spentCr: 99.75, openSlots: 9, overseasSlots: 2 },
  pbks: { players: 19, overseas: 6, spentCr: 111.4, openSlots: 6, overseasSlots: 2 },
  rcb: { players: 20, overseas: 7, spentCr: 115.85, openSlots: 5, overseasSlots: 1 },
  rr: { players: 19, overseas: 5, spentCr: 102.95, openSlots: 6, overseasSlots: 3 },
  srh: { players: 18, overseas: 5, spentCr: 89.85, openSlots: 7, overseasSlots: 3 },
};

export type RosterPlayerSource =
  | "2025-retention-cost" // same player, same real cost, repeated from the 2025 mega auction's documented retention (team may have changed since via an earlier, already-settled trade — e.g. Samson/CSK, Jadeja/RR, Bishnoi/RR)
  | "2025-auction-price" // same player, same real cost, but their 2025 figure was a live AUCTION purchase price, not a retention (e.g. Shreyas Iyer's real ₹26.75cr PBKS buy)
  | "trade" // real, reported trade valuation for this specific Dec 2026 move
  | "nominal"; // no real cost on record anywhere — set to the category's own base price, not a guess at a real figure

export type RosterPlayer = {
  teamSlug: string; // the team this player is on AFTER all Dec 2026 trades
  name: string;
  position: "Batsman" | "Bowler" | "All-rounder" | "Wicketkeeper";
  category: string; // one of MINI_AUCTION_CATEGORIES[].name
  costLakh: number;
  source: RosterPlayerSource;
  /** Only set when a trade moved this player here — the real team they left,
   * for documentation/traceability. */
  tradedFrom?: string;
  /** Sourced from iplt20.com's own team-assets API (confirmed working
   * pattern — see the plan file), visually verified one by one. Null for the
   * 3 players (Nathan Ellis, Jack Edwards, Sam Curran) whose URL resolved to
   * iplt20.com's generic fallback silhouette (confirmed via identical MD5
   * hash across all three) rather than a real photo — no real photo exists
   * for them on iplt20.com as of this research, so left unset rather than
   * storing a placeholder as if it were real. */
  photoUrl?: string;
};

/** All 184 real retained players league-wide (per-team counts confirmed
 * against the official iplt20.com snapshot — CSK 19, DC 16, GT 22, KKR 17,
 * LSG 18, MI 16, PBKS 19, RCB 20, RR 19, SRH 18). Costs: 2025-retention-cost/
 * 2025-auction-price values are copied verbatim from mock-ipl-data.ts's
 * RETAINED_PLAYERS or this session's own research (same real players, same
 * real documented number — occasionally now on a different team, via an
 * earlier already-settled trade, e.g. Sanju Samson to CSK, Ravindra Jadeja
 * and Ravi Bishnoi to RR); trade values are the real reported Dec 2026 trade
 * amounts; nominal values equal the assigned category's own base price
 * (MINI_AUCTION_CATEGORIES below) — for the ~155 players with no real cost
 * on record anywhere (this cycle's retentions weren't published with
 * per-player costs, only team aggregates), category is a reasonable
 * real-world-knowledge judgment call, not itself sourced. */
const IPLT20_ASSET = (path: string) => `https://www.iplt20.com/api/team-assets?pathname=${path}&brand=ipl`;

export const ROSTER_PLAYERS: RosterPlayer[] = [
  // ===== Royal Challengers Bengaluru (20) =====
  { teamSlug: "rcb", name: "Virat Kohli", position: "Batsman", category: "Marquee", costLakh: 2100, source: "2025-retention-cost", photoUrl: IPLT20_ASSET("player/8903/2138/13144.png") },
  { teamSlug: "rcb", name: "Rajat Patidar", position: "Batsman", category: "A-Tier", costLakh: 1000, source: "2025-retention-cost", photoUrl: IPLT20_ASSET("player/8903/2138/29333.png") },
  { teamSlug: "rcb", name: "Phil Salt", position: "Wicketkeeper", category: "A-Tier", costLakh: 100, source: "nominal", photoUrl: IPLT20_ASSET("player/8903/2138/28502.png") },
  { teamSlug: "rcb", name: "Tim David", position: "Batsman", category: "A-Tier", costLakh: 100, source: "nominal", photoUrl: IPLT20_ASSET("player/8903/2138/67369.png") },
  { teamSlug: "rcb", name: "Yash Dayal", position: "Bowler", category: "B-Tier", costLakh: 600, source: "2025-retention-cost" },
  { teamSlug: "rcb", name: "Josh Hazlewood", position: "Bowler", category: "Elite", costLakh: 150, source: "nominal" },
  { teamSlug: "rcb", name: "Bhuvneshwar Kumar", position: "Bowler", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "rcb", name: "Venkatesh Iyer", position: "All-rounder", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "rcb", name: "Krunal Pandya", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "rcb", name: "Jitesh Sharma", position: "Wicketkeeper", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "rcb", name: "Romario Shepherd", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "rcb", name: "Devdutt Padikkal", position: "Batsman", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "rcb", name: "Nuwan Thushara", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "rcb", name: "Suyash Sharma", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "rcb", name: "Jacob Duffy", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "rcb", name: "Jordan Cox", position: "Wicketkeeper", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "rcb", name: "Rasikh Dar", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "rcb", name: "Kanishk Chouhan", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "rcb", name: "Vicky Ostwal", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "rcb", name: "Abhinandan Singh", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },

  // ===== Mumbai Indians (16) =====
  { teamSlug: "mi", name: "Rohit Sharma", position: "Batsman", category: "Elite", costLakh: 1630, source: "2025-retention-cost", photoUrl: IPLT20_ASSET("player/8903/1854/11326.png") },
  { teamSlug: "mi", name: "Suryakumar Yadav", position: "Batsman", category: "Elite", costLakh: 1630, source: "2025-retention-cost", photoUrl: IPLT20_ASSET("player/8903/1854/20861.png") },
  { teamSlug: "mi", name: "Jasprit Bumrah", position: "Bowler", category: "Elite", costLakh: 1800, source: "2025-retention-cost", photoUrl: IPLT20_ASSET("player/8903/1854/16096.png") },
  { teamSlug: "mi", name: "Tilak Varma", position: "Batsman", category: "B-Tier", costLakh: 640, source: "2025-retention-cost", photoUrl: IPLT20_ASSET("player/8903/1854/69845.png") },
  { teamSlug: "mi", name: "Arshdeep Singh", position: "Bowler", category: "A-Tier", costLakh: 1800, source: "trade", tradedFrom: "pbks", photoUrl: IPLT20_ASSET("player/8903/2040/67190.png") },
  { teamSlug: "mi", name: "Quinton de Kock", position: "Wicketkeeper", category: "Elite", costLakh: 150, source: "nominal" },
  { teamSlug: "mi", name: "Mitchell Santner", position: "All-rounder", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "mi", name: "Shardul Thakur", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "mi", name: "Will Jacks", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "mi", name: "Ryan Rickelton", position: "Wicketkeeper", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "mi", name: "Corbin Bosch", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "mi", name: "Sherfane Rutherford", position: "All-rounder", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "mi", name: "Naman Dhir", position: "All-rounder", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "mi", name: "Ashwani Kumar", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "mi", name: "Raj Angad Bawa", position: "All-rounder", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "mi", name: "Raghu Sharma", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },

  // ===== Kolkata Knight Riders (17) =====
  { teamSlug: "kkr", name: "Cameron Green", position: "All-rounder", category: "A-Tier", costLakh: 100, source: "nominal", photoUrl: IPLT20_ASSET("player/8903/1873/65397.png") },
  { teamSlug: "kkr", name: "Sunil Narine", position: "All-rounder", category: "Elite", costLakh: 1400, source: "2025-retention-cost" },
  { teamSlug: "kkr", name: "Varun Chakaravarthy", position: "Bowler", category: "A-Tier", costLakh: 1200, source: "2025-retention-cost" },
  { teamSlug: "kkr", name: "Rinku Singh", position: "Batsman", category: "A-Tier", costLakh: 1000, source: "2025-retention-cost" },
  { teamSlug: "kkr", name: "Harshit Rana", position: "Bowler", category: "B-Tier", costLakh: 800, source: "2025-retention-cost" },
  { teamSlug: "kkr", name: "Ramandeep Singh", position: "All-rounder", category: "C-Tier", costLakh: 700, source: "2025-retention-cost" },
  { teamSlug: "kkr", name: "Rovman Powell", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "kkr", name: "Finn Allen", position: "Batsman", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "kkr", name: "Tim Seifert", position: "Wicketkeeper", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "kkr", name: "Manish Pandey", position: "Batsman", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "kkr", name: "Vaibhav Arora", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "kkr", name: "Angkrish Raghuvanshi", position: "Batsman", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "kkr", name: "Anukul Roy", position: "All-rounder", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "kkr", name: "Kartik Tyagi", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "kkr", name: "Prashant Solanki", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "kkr", name: "Sarthak Ranjan", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "kkr", name: "Saurabh Dubey", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },

  // ===== Sunrisers Hyderabad (18) =====
  { teamSlug: "srh", name: "Pat Cummins", position: "All-rounder", category: "Marquee", costLakh: 1800, source: "2025-retention-cost", photoUrl: IPLT20_ASSET("player/8903/1153/14153.png") },
  { teamSlug: "srh", name: "Khaleel Ahmed", position: "Bowler", category: "B-Tier", costLakh: 480, source: "trade", tradedFrom: "csk", photoUrl: IPLT20_ASSET("player/8903/1622/43272.png") },
  // Nathan Ellis: no real photoUrl — iplt20.com served its generic fallback
  // silhouette for him (confirmed by MD5-identical response), not a real photo.
  { teamSlug: "srh", name: "Nathan Ellis", position: "Bowler", category: "C-Tier", costLakh: 200, source: "trade", tradedFrom: "csk" },
  { teamSlug: "srh", name: "T Natarajan", position: "Bowler", category: "B-Tier", costLakh: 500, source: "trade", tradedFrom: "dc", photoUrl: IPLT20_ASSET("player/8903/1396/37001.png") },
  { teamSlug: "srh", name: "Heinrich Klaasen", position: "Wicketkeeper", category: "Marquee", costLakh: 2300, source: "2025-retention-cost" },
  { teamSlug: "srh", name: "Abhishek Sharma", position: "Batsman", category: "Elite", costLakh: 1400, source: "2025-retention-cost" },
  { teamSlug: "srh", name: "Nitish Kumar Reddy", position: "All-rounder", category: "B-Tier", costLakh: 800, source: "2025-retention-cost" },
  { teamSlug: "srh", name: "Ishan Kishan", position: "Wicketkeeper", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "srh", name: "Brydon Carse", position: "Bowler", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "srh", name: "Harsh Dubey", position: "All-rounder", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "srh", name: "Aniket Verma", position: "Batsman", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "srh", name: "Eshan Malinga", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "srh", name: "Praful Hinge", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "srh", name: "Sakib Hussain", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "srh", name: "Salil Arora", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "srh", name: "Shivang Kumar", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "srh", name: "Smaran Ravichandran", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "srh", name: "Krains Fuletra", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },

  // ===== Delhi Capitals (16) =====
  { teamSlug: "dc", name: "KL Rahul", position: "Wicketkeeper", category: "Elite", costLakh: 150, source: "nominal", photoUrl: IPLT20_ASSET("player/8903/1396/20451.png") },
  { teamSlug: "dc", name: "Axar Patel", position: "All-rounder", category: "A-Tier", costLakh: 1650, source: "2025-retention-cost", photoUrl: IPLT20_ASSET("player/8903/1396/17616.png") },
  { teamSlug: "dc", name: "Rishabh Pant", position: "Wicketkeeper", category: "Marquee", costLakh: 1500, source: "trade", tradedFrom: "lsg", photoUrl: IPLT20_ASSET("player/8903/2880/17617.png") },
  { teamSlug: "dc", name: "Zeeshan Ansari", position: "Bowler", category: "Uncapped", costLakh: 40, source: "trade", tradedFrom: "srh", photoUrl: IPLT20_ASSET("player/8903/1153/20236.png") },
  { teamSlug: "dc", name: "Tristan Stubbs", position: "Batsman", category: "A-Tier", costLakh: 1000, source: "2025-retention-cost" },
  { teamSlug: "dc", name: "David Miller", position: "Batsman", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "dc", name: "Kyle Jamieson", position: "Bowler", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "dc", name: "Mukesh Kumar", position: "Bowler", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "dc", name: "Lungisani Ngidi", position: "Bowler", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "dc", name: "Prithvi Shaw", position: "Batsman", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "dc", name: "Vipraj Nigam", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "dc", name: "Ashutosh Sharma", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "dc", name: "Auqib Dar", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "dc", name: "Sameer Rizvi", position: "Batsman", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "dc", name: "Madhav Tiwari", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "dc", name: "Tripurana Vijay", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },

  // ===== Lucknow Super Giants (18) =====
  { teamSlug: "lsg", name: "Kuldeep Yadav", position: "Bowler", category: "Elite", costLakh: 1350, source: "trade", tradedFrom: "dc", photoUrl: IPLT20_ASSET("player/8903/1396/20030.png") },
  // Sam Curran: no real photoUrl — same fallback-silhouette case as Ellis above.
  { teamSlug: "lsg", name: "Sam Curran", position: "All-rounder", category: "B-Tier", costLakh: 240, source: "trade", tradedFrom: "rr" },
  { teamSlug: "lsg", name: "Nicholas Pooran", position: "Wicketkeeper", category: "Marquee", costLakh: 2100, source: "2025-retention-cost" },
  { teamSlug: "lsg", name: "Mayank Yadav", position: "Bowler", category: "A-Tier", costLakh: 1100, source: "2025-retention-cost" },
  { teamSlug: "lsg", name: "Ayush Badoni", position: "Batsman", category: "C-Tier", costLakh: 400, source: "2025-retention-cost" },
  { teamSlug: "lsg", name: "Mohsin Khan", position: "Bowler", category: "C-Tier", costLakh: 400, source: "2025-retention-cost" },
  { teamSlug: "lsg", name: "Mitchell Marsh", position: "All-rounder", category: "Elite", costLakh: 150, source: "nominal" },
  { teamSlug: "lsg", name: "Aiden Markram", position: "Batsman", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "lsg", name: "Josh Inglis", position: "Wicketkeeper", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "lsg", name: "Abdul Samad", position: "All-rounder", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "lsg", name: "Digvesh Rathi", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "lsg", name: "Shahbaz Ahmed", position: "All-rounder", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "lsg", name: "Arjun Tendulkar", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "lsg", name: "Akash Singh", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "lsg", name: "Akshat Raghuwanshi", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "lsg", name: "Arshin Kulkarni", position: "All-rounder", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "lsg", name: "Mukul Choudhary", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "lsg", name: "Prince Yadav", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },

  // ===== Chennai Super Kings (19) =====
  { teamSlug: "csk", name: "Liam Livingstone", position: "All-rounder", category: "A-Tier", costLakh: 600, source: "trade", tradedFrom: "srh", photoUrl: IPLT20_ASSET("player/8903/1153/23875.png") },
  // Jack Edwards: no real photoUrl — same fallback-silhouette case as Ellis above.
  { teamSlug: "csk", name: "Jack Edwards", position: "All-rounder", category: "C-Tier", costLakh: 300, source: "trade", tradedFrom: "srh" },
  { teamSlug: "csk", name: "Ruturaj Gaikwad", position: "Batsman", category: "Elite", costLakh: 1800, source: "2025-retention-cost" },
  // Sanju Samson moved CSK's way via an earlier, already-settled 2026 trade
  // (swapped with Ravindra Jadeja + Sam Curran going to RR) — confirmed by a
  // follow-up search after this real cost's team looked surprising at first.
  { teamSlug: "csk", name: "Sanju Samson", position: "Wicketkeeper", category: "Elite", costLakh: 1800, source: "2025-retention-cost" },
  { teamSlug: "csk", name: "Shivam Dube", position: "All-rounder", category: "A-Tier", costLakh: 1200, source: "2025-retention-cost" },
  { teamSlug: "csk", name: "Noor Ahmad", position: "Bowler", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "csk", name: "Rahul Chahar", position: "Bowler", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "csk", name: "Dewald Brevis", position: "Batsman", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "csk", name: "Sarfaraz Khan", position: "Batsman", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "csk", name: "Mukesh Choudhary", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "csk", name: "Akeal Hosein", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "csk", name: "Shreyas Gopal", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "csk", name: "Urvil Patel", position: "Wicketkeeper", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "csk", name: "Anshul Kamboj", position: "Bowler", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "csk", name: "Ayush Mhatre", position: "Batsman", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "csk", name: "Gurjapneet Singh", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "csk", name: "Kartik Sharma", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "csk", name: "Ramakrishna Ghosh", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },

  // ===== Punjab Kings (19) =====
  { teamSlug: "pbks", name: "Hardik Pandya", position: "All-rounder", category: "Elite", costLakh: 1800, source: "trade", tradedFrom: "mi", photoUrl: IPLT20_ASSET("player/8903/1854/16093.png") },
  // Shreyas Iyer's real cost is his 2025 AUCTION price (not a retention) —
  // PBKS's captain, confirmed retained for this cycle too.
  { teamSlug: "pbks", name: "Shreyas Iyer", position: "Batsman", category: "Marquee", costLakh: 2675, source: "2025-auction-price" },
  { teamSlug: "pbks", name: "Shashank Singh", position: "All-rounder", category: "C-Tier", costLakh: 550, source: "2025-retention-cost" },
  { teamSlug: "pbks", name: "Prabhsimran Singh", position: "Wicketkeeper", category: "C-Tier", costLakh: 400, source: "2025-retention-cost" },
  { teamSlug: "pbks", name: "Marcus Stoinis", position: "All-rounder", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "pbks", name: "Marco Jansen", position: "All-rounder", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "pbks", name: "Yuzvendra Chahal", position: "Bowler", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "pbks", name: "Azmatullah Omarzai", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "pbks", name: "Harpreet Brar", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "pbks", name: "Priyansh Arya", position: "Batsman", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "pbks", name: "Ben Dwarshuis", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "pbks", name: "Cooper Connolly", position: "All-rounder", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "pbks", name: "Xavier Bartlett", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "pbks", name: "Yash Thakur", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "pbks", name: "Harnoor Pannu", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "pbks", name: "Musheer Khan", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "pbks", name: "Suryansh Shedge", position: "All-rounder", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "pbks", name: "Vishnu Vinod", position: "Wicketkeeper", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "pbks", name: "Vyshak Vijaykumar", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },

  // ===== Gujarat Titans (22) =====
  { teamSlug: "gt", name: "Harshal Patel", position: "All-rounder", category: "A-Tier", costLakh: 400, source: "trade", tradedFrom: "srh", photoUrl: IPLT20_ASSET("player/8903/1153/18000.png") },
  { teamSlug: "gt", name: "Rashid Khan", position: "Bowler", category: "Marquee", costLakh: 1800, source: "2025-retention-cost" },
  { teamSlug: "gt", name: "Shubman Gill", position: "Batsman", category: "Elite", costLakh: 1650, source: "2025-retention-cost" },
  { teamSlug: "gt", name: "Sai Sudharsan", position: "Batsman", category: "A-Tier", costLakh: 1000, source: "2025-retention-cost" },
  { teamSlug: "gt", name: "Rahul Tewatia", position: "All-rounder", category: "B-Tier", costLakh: 800, source: "2025-retention-cost" },
  { teamSlug: "gt", name: "Jos Buttler", position: "Wicketkeeper", category: "Elite", costLakh: 150, source: "nominal" },
  { teamSlug: "gt", name: "Kagiso Rabada", position: "Bowler", category: "Elite", costLakh: 150, source: "nominal" },
  { teamSlug: "gt", name: "Mohammad Siraj", position: "Bowler", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "gt", name: "Washington Sundar", position: "All-rounder", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "gt", name: "Glenn Phillips", position: "All-rounder", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "gt", name: "Jason Holder", position: "All-rounder", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "gt", name: "Prasidh Krishna", position: "Bowler", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "gt", name: "Tom Banton", position: "Wicketkeeper", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "gt", name: "Jayant Yadav", position: "All-rounder", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "gt", name: "R. Sai Kishore", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "gt", name: "Nishant Sindhu", position: "All-rounder", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "gt", name: "Anuj Rawat", position: "Wicketkeeper", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "gt", name: "Ashok Sharma", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "gt", name: "Gurnoor Singh Brar", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "gt", name: "Kumar Kushagra", position: "Wicketkeeper", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "gt", name: "Manav Suthar", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "gt", name: "Mohd. Arshad Khan", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },

  // ===== Rajasthan Royals (19) =====
  { teamSlug: "rr", name: "Mohammed Shami", position: "Bowler", category: "A-Tier", costLakh: 800, source: "trade", tradedFrom: "lsg", photoUrl: IPLT20_ASSET("player/8903/2880/11458.png") },
  { teamSlug: "rr", name: "Manimaran Siddharth", position: "Bowler", category: "E-Tier", costLakh: 75, source: "trade", tradedFrom: "lsg", photoUrl: IPLT20_ASSET("player/8903/2880/69572.png") },
  // Ravindra Jadeja and Ravi Bishnoi both moved RR's way via the same
  // already-settled earlier trade/transfer activity as Samson above
  // (confirmed via follow-up search) — real 2025 costs reused as-is.
  { teamSlug: "rr", name: "Ravindra Jadeja", position: "All-rounder", category: "Elite", costLakh: 1800, source: "2025-retention-cost" },
  { teamSlug: "rr", name: "Ravi Bishnoi", position: "Bowler", category: "A-Tier", costLakh: 1100, source: "2025-retention-cost" },
  { teamSlug: "rr", name: "Yashasvi Jaiswal", position: "Batsman", category: "Marquee", costLakh: 1800, source: "2025-retention-cost" },
  { teamSlug: "rr", name: "Riyan Parag", position: "All-rounder", category: "A-Tier", costLakh: 1400, source: "2025-retention-cost" },
  { teamSlug: "rr", name: "Dhruv Jurel", position: "Wicketkeeper", category: "A-Tier", costLakh: 1400, source: "2025-retention-cost" },
  { teamSlug: "rr", name: "Sandeep Sharma", position: "Bowler", category: "C-Tier", costLakh: 400, source: "2025-retention-cost" },
  { teamSlug: "rr", name: "Jofra Archer", position: "Bowler", category: "A-Tier", costLakh: 100, source: "nominal" },
  { teamSlug: "rr", name: "Vaibhav Sooryavanshi", position: "Batsman", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "rr", name: "Dasun Shanaka", position: "All-rounder", category: "B-Tier", costLakh: 75, source: "nominal" },
  { teamSlug: "rr", name: "Lhuan-dre Pretorius", position: "Batsman", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "rr", name: "Donovan Ferreira", position: "Wicketkeeper", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "rr", name: "Nandre Burger", position: "Bowler", category: "C-Tier", costLakh: 50, source: "nominal" },
  { teamSlug: "rr", name: "Aman Rao Perala", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "rr", name: "Brijesh Sharma", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "rr", name: "Shubham Dubey", position: "Batsman", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "rr", name: "Sushant Mishra", position: "Bowler", category: "D-Tier", costLakh: 40, source: "nominal" },
  { teamSlug: "rr", name: "Yash Raj Punja", position: "All-rounder", category: "D-Tier", costLakh: 40, source: "nominal" },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function jitter(spread: number): number {
  return (Math.random() * 2 - 1) * spread;
}

/** Same formula as mock-ipl-data.ts's ratingsForPlayer, but keyed off
 * MINI_AUCTION_CATEGORIES instead of the 2025 cycle's own CATEGORIES module
 * — that function's tierIndex lookup would silently return -1 (not found)
 * for this cycle's new "Premium" tier, inflating its rating above Marquee's.
 * A local copy (not a shared-function change, since the 2025 scripts still
 * need their own ladder unchanged), used for BOTH ROSTER_PLAYERS and
 * OPEN_POOL_PLAYERS now that they're in one unified auction/category set. */
export function ratingsForMiniAuctionTier(
  category: string,
  position: OpenPoolPlayer["position"]
): { rating: number; battingRating: number; bowlingRating: number; fieldingRating: number } {
  const tierIndex = MINI_AUCTION_CATEGORIES.findIndex((c) => c.name === category);
  const base10 = clamp(9.3 - tierIndex * 0.8 + jitter(0.4), 2, 10);
  const overall100 = clamp(94 - tierIndex * 8 + jitter(4), 20, 99);

  let battingRating = base10 * 0.4;
  let bowlingRating = base10 * 0.4;
  let fieldingRating = clamp(base10 * 0.6 + jitter(0.3), 1, 10);

  if (position === "Batsman") {
    battingRating = base10;
  } else if (position === "Bowler") {
    bowlingRating = base10;
  } else if (position === "Wicketkeeper") {
    battingRating = base10 * 0.85;
    fieldingRating = clamp(base10, 1, 10);
  } else {
    battingRating = base10 * 0.8;
    bowlingRating = base10 * 0.8;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    rating: round1(overall100),
    battingRating: round1(battingRating),
    bowlingRating: round1(bowlingRating),
    fieldingRating: round1(fieldingRating),
  };
}

export type OpenPoolPlayer = {
  name: string;
  position: "Batsman" | "Bowler" | "All-rounder" | "Wicketkeeper";
  category: string; // one of MINI_AUCTION_CATEGORIES[].name
  /** Real nationality, for documentation only — this app has no nationality
   * field on Player. */
  nationality: string;
};

/** The real, named, registered-for-auction player pool — see the module
 * header for sourcing. None of these 76 overlap with ROSTER_PLAYERS above
 * (those are already-rostered via retention/trade; these are free agents
 * actually going under the hammer). Position is inferred from real-world
 * knowledge of each player's role where not explicitly stated by the
 * source — reasonable confidence for established internationals, lower
 * confidence for the less-known domestic names in the lower tiers. */
export const OPEN_POOL_PLAYERS: OpenPoolPlayer[] = [
  // ₹2 crore tier (Marquee)
  { name: "Avesh Khan", position: "Bowler", category: "Marquee", nationality: "India" },
  { name: "Deepak Chahar", position: "Bowler", category: "Marquee", nationality: "India" },
  { name: "Ben Stokes", position: "All-rounder", category: "Marquee", nationality: "England" },
  { name: "Fazalhaq Farooqi", position: "Bowler", category: "Marquee", nationality: "Afghanistan" },
  { name: "Mujeeb Ur Rahman", position: "Bowler", category: "Marquee", nationality: "Afghanistan" },
  { name: "Rahmanullah Gurbaz", position: "Wicketkeeper", category: "Marquee", nationality: "Afghanistan" },
  { name: "David Warner", position: "Batsman", category: "Marquee", nationality: "Australia" },
  { name: "Jake Fraser-McGurk", position: "Batsman", category: "Marquee", nationality: "Australia" },
  { name: "Jhye Richardson", position: "Bowler", category: "Marquee", nationality: "Australia" },
  { name: "Mahli Beardman", position: "Bowler", category: "Marquee", nationality: "Australia" },
  { name: "Spencer Johnson", position: "Bowler", category: "Marquee", nationality: "Australia" },
  { name: "Jonny Bairstow", position: "Wicketkeeper", category: "Marquee", nationality: "England" },
  { name: "Sam Billings", position: "Wicketkeeper", category: "Marquee", nationality: "England" },
  { name: "Sonny Baker", position: "Bowler", category: "Marquee", nationality: "England" },
  { name: "Tom Curran", position: "All-rounder", category: "Marquee", nationality: "England" },
  { name: "Adam Milne", position: "Bowler", category: "Marquee", nationality: "New Zealand" },
  { name: "Ben Sears", position: "Bowler", category: "Marquee", nationality: "New Zealand" },
  { name: "Bevon Jacobs", position: "Batsman", category: "Marquee", nationality: "New Zealand" },
  { name: "Daryl Mitchell", position: "Batsman", category: "Marquee", nationality: "New Zealand" },
  { name: "Devon Conway", position: "Wicketkeeper", category: "Marquee", nationality: "New Zealand" },
  { name: "Rachin Ravindra", position: "All-rounder", category: "Marquee", nationality: "New Zealand" },
  { name: "Trent Boult", position: "Bowler", category: "Marquee", nationality: "New Zealand" },
  { name: "Will O'Rourke", position: "Bowler", category: "Marquee", nationality: "New Zealand" },
  { name: "Anrich Nortje", position: "Bowler", category: "Marquee", nationality: "South Africa" },
  { name: "Gerald Coetzee", position: "Bowler", category: "Marquee", nationality: "South Africa" },
  { name: "Matheesha Pathirana", position: "Bowler", category: "Marquee", nationality: "Sri Lanka" },
  { name: "Wanindu Hasaranga", position: "All-rounder", category: "Marquee", nationality: "Sri Lanka" },
  { name: "Shai Hope", position: "Wicketkeeper", category: "Marquee", nationality: "West Indies" },
  { name: "Shimron Hetmyer", position: "Batsman", category: "Marquee", nationality: "West Indies" },

  // ₹1.50 crore tier (Elite)
  { name: "Allah Ghazanfar", position: "Bowler", category: "Elite", nationality: "Afghanistan" },
  { name: "Daniel Sams", position: "All-rounder", category: "Elite", nationality: "Australia" },
  { name: "Riley Meredith", position: "Bowler", category: "Elite", nationality: "Australia" },
  { name: "David Wiese", position: "All-rounder", category: "Elite", nationality: "South Africa" },
  { name: "Rassie van der Dussen", position: "Batsman", category: "Elite", nationality: "South Africa" },
  { name: "Jayden Seales", position: "Bowler", category: "Elite", nationality: "West Indies" },
  { name: "Keemo Paul", position: "All-rounder", category: "Elite", nationality: "West Indies" },

  // ₹1.25 crore tier (Premium)
  { name: "Ashton Agar", position: "All-rounder", category: "Premium", nationality: "Australia" },
  { name: "Billy Stanlake", position: "Bowler", category: "Premium", nationality: "Australia" },
  { name: "Kyle Mayers", position: "All-rounder", category: "Premium", nationality: "West Indies" },
  { name: "Matthew Forde", position: "Bowler", category: "Premium", nationality: "West Indies" },

  // ₹1 crore tier (A-Tier)
  { name: "Gulbadin Naib", position: "All-rounder", category: "A-Tier", nationality: "Afghanistan" },
  { name: "Ibrahim Zadran", position: "Batsman", category: "A-Tier", nationality: "Afghanistan" },
  { name: "Mohammad Nabi", position: "All-rounder", category: "A-Tier", nationality: "Afghanistan" },
  { name: "Chris Lynn", position: "Batsman", category: "A-Tier", nationality: "Australia" },
  { name: "Scott Boland", position: "Bowler", category: "A-Tier", nationality: "Australia" },
  { name: "Akash Deep", position: "Bowler", category: "A-Tier", nationality: "India" },
  { name: "Blair Tickner", position: "Bowler", category: "A-Tier", nationality: "New Zealand" },
  { name: "Matthew Fisher", position: "Bowler", category: "A-Tier", nationality: "England" },
  { name: "Nathan Smith", position: "All-rounder", category: "A-Tier", nationality: "New Zealand" },
  { name: "Zak Foulkes", position: "Bowler", category: "A-Tier", nationality: "New Zealand" },
  { name: "Duan Jansen", position: "All-rounder", category: "A-Tier", nationality: "South Africa" },
  { name: "Marques Ackerman", position: "Batsman", category: "A-Tier", nationality: "South Africa" },
  { name: "Matthew Breetzke", position: "Batsman", category: "A-Tier", nationality: "South Africa" },
  { name: "Ottneil Baartman", position: "Bowler", category: "A-Tier", nationality: "South Africa" },
  { name: "Charith Asalanka", position: "Batsman", category: "A-Tier", nationality: "Sri Lanka" },
  { name: "Dushmantha Chameera", position: "Bowler", category: "A-Tier", nationality: "Sri Lanka" },
  { name: "Kusal Mendis", position: "Wicketkeeper", category: "A-Tier", nationality: "Sri Lanka" },
  { name: "Maheesh Theekshana", position: "Bowler", category: "A-Tier", nationality: "Sri Lanka" },
  { name: "Sonal Dinusha", position: "Bowler", category: "A-Tier", nationality: "Sri Lanka" },
  { name: "Jaydev Unadkat", position: "Bowler", category: "A-Tier", nationality: "India" },
  { name: "Tushar Deshpande", position: "Bowler", category: "A-Tier", nationality: "India" },
  { name: "Umesh Yadav", position: "Bowler", category: "A-Tier", nationality: "India" },
  { name: "Andre Fletcher", position: "Wicketkeeper", category: "A-Tier", nationality: "West Indies" },
  { name: "John Campbell", position: "Batsman", category: "A-Tier", nationality: "West Indies" },
  { name: "Matthew Kuhnemann", position: "Bowler", category: "A-Tier", nationality: "Australia" },
  { name: "Nikhil Chaudhary", position: "Batsman", category: "A-Tier", nationality: "India" },
  { name: "Tymal Mills", position: "Bowler", category: "A-Tier", nationality: "England" },
  { name: "Newman Nyamhuri", position: "Bowler", category: "A-Tier", nationality: "Zimbabwe" },

  // ₹75 lakh tier (B-Tier)
  { name: "Deepak Hooda", position: "All-rounder", category: "B-Tier", nationality: "India" },
  { name: "Karun Nair", position: "Batsman", category: "B-Tier", nationality: "India" },
  { name: "Kuldeep Sen", position: "Bowler", category: "B-Tier", nationality: "India" },
  { name: "Mayank Agarwal", position: "Batsman", category: "B-Tier", nationality: "India" },
  { name: "Rahul Tripathi", position: "Batsman", category: "B-Tier", nationality: "India" },
  { name: "Saransh Jain", position: "Bowler", category: "B-Tier", nationality: "India" },
  { name: "Shivam Mavi", position: "Bowler", category: "B-Tier", nationality: "India" },
  { name: "Umran Malik", position: "Bowler", category: "B-Tier", nationality: "India" },
];
