// Shared mock-IPL data: teams, categories, and the ~230-player pool.
// Pure data, no Prisma/service calls — imported by every mock-ipl-*.ts script
// so the foundation, the two auctions, and the verifier never disagree on
// names/tiers. Amounts are in lakhs (1 crore = 100) throughout this dataset.

export const LEAGUE_NAME = "IPL Mock Analytics League";
export const TOURNAMENT_NAME = "IPL 2025 Mock Season";
export const ROSTER_NAME = "IPL 2025 Mock Player Pool";
// Real IPL squad size (the user asked to go back to this for realism).
// squadSize is tournament-wide (shared by both auctions, each a fully
// independent from-zero build since this app has no retention/RTM), so
// 20 x 10 teams = 200 slots needed per auction — the player pool below was
// expanded (to ~480 distinct real names) specifically so both auctions
// have real statistical slack against that demand; it was NOT enough at
// the original 230-name pool, which is why this was temporarily 10.
export const SQUAD_SIZE = 20;
export const MOCK_PASSWORD = "mock123";
// Named here (not in the auction scripts themselves) so mock-ipl-verify.ts
// can import them without also importing — and thereby re-running — those
// scripts' side-effecting main().
export const MEGA_AUCTION_NAME = "IPL 2025 Mega Auction";
export const MINI_AUCTION_NAME = "IPL 2025 Mini Auction";

export type MockTeam = {
  /** Used to build the mock manager's loginId: `manager-${slug}@mockipl.local`. */
  slug: string;
  name: string;
  /** Direct logo image URL, sourced from the team's own official website
   * (Wikimedia Commons 429-rate-limited 9 of 10 of these during this
   * session's testing — see mock-ipl-foundation.ts). Gujarat Titans is the
   * one exception that already succeeded via Wikimedia, so it's left as-is. */
  logoUrl: string;
};

// Real 2025 IPL franchises. KKR is the headline team (both scripted
// scenarios in the plan); every other team gets its own researched
// Strategy profile (see mock-ipl-auction-mega.ts).
export const TEAMS: MockTeam[] = [
  {
    slug: "mi",
    name: "Mumbai Indians",
    logoUrl: "https://www.mumbaiindians.com/static-assets/images/cssimages/svg/mi-logo.svg",
  },
  {
    slug: "csk",
    name: "Chennai Super Kings",
    logoUrl: "https://www.chennaisuperkings.com/assets/images/mainlogo.png",
  },
  {
    slug: "rcb",
    name: "Royal Challengers Bengaluru",
    logoUrl: "https://www.royalchallengers.com/themes/custom/rcbbase/images/rcb-logo-new.png",
  },
  {
    slug: "kkr",
    name: "Kolkata Knight Riders",
    logoUrl: "https://www.kkr.in/static-assets/favicons/apple-touch-icon.png",
  },
  {
    slug: "dc",
    name: "Delhi Capitals",
    logoUrl: "https://www.delhicapitals.in/static-assets/favicons/apple-touch-icon.png",
  },
  {
    slug: "pbks",
    name: "Punjab Kings",
    logoUrl: "https://www.punjabkingsipl.in/static-assets/images/cssimages/svg/pbks-logo.svg",
  },
  {
    slug: "rr",
    name: "Rajasthan Royals",
    logoUrl: "https://www.rajasthanroyals.com/static-assets/favicons/apple-touch-icon.png",
  },
  {
    slug: "srh",
    name: "Sunrisers Hyderabad",
    logoUrl: "https://www.sunrisershyderabad.in/assets/teamLogo/srhLogo.svg",
  },
  {
    slug: "lsg",
    name: "Lucknow Super Giants",
    logoUrl: "https://www.lucknowsupergiants.in/static-assets/favicons/apple-touch-icon.png",
  },
  {
    slug: "gt",
    name: "Gujarat Titans",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/0/09/Gujarat_Titans_Logo.svg",
  },
];

export type MockCategory = { name: string; basePrice: number; bidIncrement: number };

// Same 8-tier ladder reused by name/price in both auctions.
export const CATEGORIES: MockCategory[] = [
  { name: "Marquee", basePrice: 200, bidIncrement: 50 },
  { name: "Elite", basePrice: 150, bidIncrement: 25 },
  { name: "A-Tier", basePrice: 100, bidIncrement: 25 },
  { name: "B-Tier", basePrice: 75, bidIncrement: 25 },
  { name: "C-Tier", basePrice: 50, bidIncrement: 10 },
  { name: "D-Tier", basePrice: 40, bidIncrement: 10 },
  { name: "E-Tier", basePrice: 30, bidIncrement: 5 },
  { name: "Uncapped", basePrice: 20, bidIncrement: 5 },
];

export type MockPlayerPosition = "Batsman" | "Bowler" | "All-rounder" | "Wicketkeeper";

export type MockPlayer = {
  name: string;
  position: MockPlayerPosition;
  category: string; // one of CATEGORIES[].name
  photoUrl?: string;
};

/** The real players each franchise retained before the real 2025 mega
 * auction, at their real (or, where no source gave a per-player figure,
 * a reasonable split of the real reported team total) retention cost in
 * lakhs (cr x 100). Assigned via adminAssignPlayer at the very start of
 * the mega auction, before any other sale — retention happens before an
 * auction even opens, not during it. Not replayed in the mini auction:
 * real IPL retention is a once-per-mega-cycle event, and RTM (the
 * mechanic retention enables) explicitly does not exist at mini auctions
 * either (confirmed in this session's research). */
export type RetainedPlayer = { teamSlug: string; name: string; costLakh: number };

export const RETAINED_PLAYERS: RetainedPlayer[] = [
  // Mumbai Indians — 5 retained, real team total 75cr; per-player split
  // below is a reasonable estimate (sources gave the team total only).
  { teamSlug: "mi", name: "Jasprit Bumrah", costLakh: 1800 },
  { teamSlug: "mi", name: "Hardik Pandya", costLakh: 1800 },
  { teamSlug: "mi", name: "Rohit Sharma", costLakh: 1630 },
  { teamSlug: "mi", name: "Suryakumar Yadav", costLakh: 1630 },
  { teamSlug: "mi", name: "Tilak Varma", costLakh: 640 },
  // Chennai Super Kings — 5 retained, real per-player costs confirmed.
  { teamSlug: "csk", name: "Ruturaj Gaikwad", costLakh: 1800 },
  { teamSlug: "csk", name: "Ravindra Jadeja", costLakh: 1800 },
  { teamSlug: "csk", name: "Matheesha Pathirana", costLakh: 1300 },
  { teamSlug: "csk", name: "Shivam Dube", costLakh: 1200 },
  { teamSlug: "csk", name: "MS Dhoni", costLakh: 400 },
  // Royal Challengers Bengaluru — 3 retained, real team total 37cr
  // (120cr purse - 83cr remaining); per-player split estimated.
  { teamSlug: "rcb", name: "Virat Kohli", costLakh: 2100 },
  { teamSlug: "rcb", name: "Rajat Patidar", costLakh: 1000 },
  { teamSlug: "rcb", name: "Yash Dayal", costLakh: 600 },
  // Kolkata Knight Riders — 6 retained (no RTM cards), real team total
  // 69cr; per-player split estimated.
  { teamSlug: "kkr", name: "Andre Russell", costLakh: 1800 },
  { teamSlug: "kkr", name: "Sunil Narine", costLakh: 1400 },
  { teamSlug: "kkr", name: "Varun Chakravarthy", costLakh: 1200 },
  { teamSlug: "kkr", name: "Rinku Singh", costLakh: 1000 },
  { teamSlug: "kkr", name: "Harshit Rana", costLakh: 800 },
  { teamSlug: "kkr", name: "Ramandeep Singh", costLakh: 700 },
  // Delhi Capitals — 4 retained, real per-player costs confirmed. Pant
  // was NOT retained by DC in reality — he's a genuine auction buy below.
  { teamSlug: "dc", name: "Axar Patel", costLakh: 1650 },
  { teamSlug: "dc", name: "Kuldeep Yadav", costLakh: 1325 },
  { teamSlug: "dc", name: "Tristan Stubbs", costLakh: 1000 },
  { teamSlug: "dc", name: "Abishek Porel", costLakh: 400 },
  // Punjab Kings — only 2 retained (fewest of all 10), real per-player
  // costs confirmed. Shreyas Iyer was NOT retained — genuine auction buy.
  { teamSlug: "pbks", name: "Shashank Singh", costLakh: 550 },
  { teamSlug: "pbks", name: "Prabhsimran Singh", costLakh: 400 },
  // Rajasthan Royals — 6 retained (max allowed, 0 RTM cards), real
  // per-player costs confirmed.
  { teamSlug: "rr", name: "Sanju Samson", costLakh: 1800 },
  { teamSlug: "rr", name: "Yashasvi Jaiswal", costLakh: 1800 },
  { teamSlug: "rr", name: "Riyan Parag", costLakh: 1400 },
  { teamSlug: "rr", name: "Dhruv Jurel", costLakh: 1400 },
  { teamSlug: "rr", name: "Shimron Hetmyer", costLakh: 1100 },
  { teamSlug: "rr", name: "Sandeep Sharma", costLakh: 400 },
  // Sunrisers Hyderabad — 5 retained; Klaasen's cost confirmed (23cr),
  // the rest (incl. captain Cummins) split to match the real ~75cr total.
  { teamSlug: "srh", name: "Pat Cummins", costLakh: 1800 },
  { teamSlug: "srh", name: "Heinrich Klaasen", costLakh: 2300 },
  { teamSlug: "srh", name: "Abhishek Sharma", costLakh: 1400 },
  { teamSlug: "srh", name: "Travis Head", costLakh: 1200 },
  { teamSlug: "srh", name: "Nitish Kumar Reddy", costLakh: 800 },
  // Lucknow Super Giants — 5 retained, real per-player costs confirmed.
  // KL Rahul was their headline RELEASE — genuinely available below.
  { teamSlug: "lsg", name: "Nicholas Pooran", costLakh: 2100 },
  { teamSlug: "lsg", name: "Ravi Bishnoi", costLakh: 1100 },
  { teamSlug: "lsg", name: "Mayank Yadav", costLakh: 1100 },
  { teamSlug: "lsg", name: "Ayush Badoni", costLakh: 400 },
  { teamSlug: "lsg", name: "Mohsin Khan", costLakh: 400 },
  // Gujarat Titans — 5 retained; Rashid Khan and Gill's costs confirmed,
  // the rest estimated. Jos Buttler was NOT retained — genuine auction buy.
  { teamSlug: "gt", name: "Rashid Khan", costLakh: 1800 },
  { teamSlug: "gt", name: "Shubman Gill", costLakh: 1650 },
  { teamSlug: "gt", name: "Sai Sudharsan", costLakh: 1000 },
  { teamSlug: "gt", name: "Rahul Tewatia", costLakh: 800 },
  { teamSlug: "gt", name: "Shahrukh Khan", costLakh: 600 },
];

// Named anchors — real, recognizable players, one specific photo URL each,
// sourced from each player's own current real-world IPL team's official
// website (same approach as the team logos) rather than Wikimedia — see
// mock-ipl-foundation.ts's fetchImageBytes for the shared fetch path.
// These are also the players referenced by the scripted scenarios and the
// per-team real-target mapping in mock-ipl-auction-mega.ts.
// Exported so mock-ipl-helpers.ts's splitPoolForAuctions can keep every
// named anchor in the mega auction only (mini never needs a specific star).
export const ANCHORS: MockPlayer[] = [
  // Marquee
  { name: "Rishabh Pant", position: "Wicketkeeper", category: "Marquee", photoUrl: "https://www.delhicapitals.in/static-assets/images/players/ipl/65756.png?v=2.74" },
  { name: "Shreyas Iyer", position: "Batsman", category: "Marquee", photoUrl: "https://www.kkr.in/static-assets/images/players/63961.png?v=112.14" },
  { name: "Mitchell Starc", position: "Bowler", category: "Marquee", photoUrl: "https://www.kkr.in/static-assets/images/players/10053.png?v=112.14" },
  { name: "Pat Cummins", position: "All-rounder", category: "Marquee", photoUrl: "https://d1zakxcsliwds.cloudfront.net/image-pool/86ed30b6fc9f4c42a6771bffcf561666.png" },
  { name: "Venkatesh Iyer", position: "All-rounder", category: "Marquee", photoUrl: "https://www.kkr.in/static-assets/images/players/65430.png?v=112.14" },
  { name: "Virat Kohli", position: "Batsman", category: "Marquee", photoUrl: "https://www.royalchallengers.com/PRRCB01/public/styles/large/public/2026-03/virat.png?itok=ASbToYvG" },
  // Elite
  { name: "Yuzvendra Chahal", position: "Bowler", category: "Elite" },
  { name: "Jasprit Bumrah", position: "Bowler", category: "Elite" },
  { name: "Hardik Pandya", position: "All-rounder", category: "Elite" },
  { name: "Rohit Sharma", position: "Batsman", category: "Elite" },
  { name: "Suryakumar Yadav", position: "Batsman", category: "Elite" },
  { name: "KL Rahul", position: "Wicketkeeper", category: "Elite" },
  { name: "MS Dhoni", position: "Wicketkeeper", category: "Elite" },
  { name: "Ravindra Jadeja", position: "All-rounder", category: "Elite" },
  { name: "Jos Buttler", position: "Wicketkeeper", category: "Elite" },
  { name: "Devon Conway", position: "Batsman", category: "Elite" },
  // A-Tier
  { name: "Harshal Patel", position: "All-rounder", category: "A-Tier" },
  { name: "Axar Patel", position: "All-rounder", category: "A-Tier" },
  { name: "Mohammed Siraj", position: "Bowler", category: "A-Tier" },
  { name: "Mohammed Shami", position: "Bowler", category: "A-Tier" },
  { name: "Shubman Gill", position: "Batsman", category: "A-Tier" },
  { name: "Ishan Kishan", position: "Wicketkeeper", category: "A-Tier" },
  { name: "Arshdeep Singh", position: "Bowler", category: "A-Tier" },
  { name: "Trent Boult", position: "Bowler", category: "A-Tier" },
  { name: "R Ashwin", position: "Bowler", category: "A-Tier" },
  { name: "Noor Ahmad", position: "Bowler", category: "A-Tier" },
  { name: "Bhuvneshwar Kumar", position: "Bowler", category: "A-Tier" },
  { name: "Josh Hazlewood", position: "Bowler", category: "A-Tier" },
  { name: "Jofra Archer", position: "Bowler", category: "A-Tier" },
];

/** Every name that MUST land in the mega auction's pool specifically:
 * every named anchor, every real retained player (see RETAINED_PLAYERS —
 * retention only happens pre-mega), and any other name a script
 * references directly by name (Glenn Maxwell, SRH's live-auction
 * finisher-type must-have). Used by splitPoolForAuctions. */
export const GUARANTEED_MEGA_NAMES: ReadonlySet<string> = new Set([
  ...ANCHORS.map((a) => a.name),
  ...RETAINED_PLAYERS.map((r) => r.name),
  "Glenn Maxwell",
]);

/** Every retained player's real-world team doesn't change between the mega
 * and mini auction — a team's retained core persists all season — so both
 * auctions replay the same RETAINED_PLAYERS assignment at the same real
 * cost. Used by splitPoolForAuctions to guarantee these names land in BOTH
 * pools (unlike the rest of GUARANTEED_MEGA_NAMES, which stays mega-only:
 * mini never needs a specific live-contest star). */
export const RETAINED_NAMES: ReadonlySet<string> = new Set(RETAINED_PLAYERS.map((r) => r.name));

// Additional real, widely-known IPL-pool names rounding out the rest of the
// pool (B-Tier through Uncapped). Not individually sourced/photographed —
// see the plan's "Images" section for why that's an acceptable scope limit.
const FILLER_NAMES: { name: string; position: MockPlayerPosition }[] = [
  { name: "Deepak Chahar", position: "Bowler" },
  { name: "Shardul Thakur", position: "All-rounder" },
  { name: "Washington Sundar", position: "All-rounder" },
  { name: "Kuldeep Yadav", position: "Bowler" },
  { name: "Ravi Bishnoi", position: "Bowler" },
  { name: "Tilak Varma", position: "Batsman" },
  { name: "Yashasvi Jaiswal", position: "Batsman" },
  { name: "Ruturaj Gaikwad", position: "Batsman" },
  { name: "Sanju Samson", position: "Wicketkeeper" },
  { name: "Nitish Rana", position: "Batsman" },
  { name: "Rinku Singh", position: "Batsman" },
  { name: "Varun Chakravarthy", position: "Bowler" },
  { name: "Andre Russell", position: "All-rounder" },
  { name: "Sunil Narine", position: "All-rounder" },
  { name: "Harshit Rana", position: "Bowler" },
  { name: "Ramandeep Singh", position: "All-rounder" },
  { name: "Sai Sudharsan", position: "Batsman" },
  { name: "Rashid Khan", position: "Bowler" },
  { name: "Shahrukh Khan", position: "All-rounder" },
  { name: "Rahul Tewatia", position: "All-rounder" },
  { name: "Zaheer Khan", position: "Bowler" },
  { name: "Heinrich Klaasen", position: "Wicketkeeper" },
  { name: "Travis Head", position: "Batsman" },
  { name: "Abhishek Sharma", position: "Batsman" },
  { name: "Nitish Kumar Reddy", position: "All-rounder" },
  { name: "Pat Brown", position: "Bowler" },
  { name: "Marcus Stoinis", position: "All-rounder" },
  { name: "Rachin Ravindra", position: "All-rounder" },
  { name: "Will Jacks", position: "Batsman" },
  { name: "Ryan Rickelton", position: "Wicketkeeper" },
  { name: "Mitchell Santner", position: "All-rounder" },
  { name: "Shivam Dube", position: "All-rounder" },
  { name: "Matheesha Pathirana", position: "Bowler" },
  { name: "Mustafizur Rahman", position: "Bowler" },
  { name: "Glenn Maxwell", position: "All-rounder" },
  { name: "Cameron Green", position: "All-rounder" },
  { name: "Liam Livingstone", position: "All-rounder" },
  { name: "David Miller", position: "Batsman" },
  { name: "Quinton de Kock", position: "Wicketkeeper" },
  { name: "Faf du Plessis", position: "Batsman" },
  { name: "Aiden Markram", position: "Batsman" },
  { name: "Wanindu Hasaranga", position: "All-rounder" },
  { name: "Maheesh Theekshana", position: "Bowler" },
  { name: "Adam Zampa", position: "Bowler" },
  { name: "Daryl Mitchell", position: "All-rounder" },
  { name: "Tim David", position: "Batsman" },
  { name: "Nicholas Pooran", position: "Wicketkeeper" },
  { name: "Shimron Hetmyer", position: "Batsman" },
  { name: "Jason Holder", position: "All-rounder" },
  { name: "Kagiso Rabada", position: "Bowler" },
  { name: "Anrich Nortje", position: "Bowler" },
  { name: "Lockie Ferguson", position: "Bowler" },
  { name: "Tim Southee", position: "Bowler" },
  { name: "Mark Wood", position: "Bowler" },
  { name: "Sam Curran", position: "All-rounder" },
  { name: "Reece Topley", position: "Bowler" },
  { name: "Chris Woakes", position: "All-rounder" },
  { name: "Dushmantha Chameera", position: "Bowler" },
  { name: "Akeal Hosein", position: "Bowler" },
  { name: "Prithvi Shaw", position: "Batsman" },
  { name: "Mayank Agarwal", position: "Batsman" },
  { name: "Manish Pandey", position: "Batsman" },
  { name: "Shreyas Gopal", position: "Bowler" },
  { name: "Krunal Pandya", position: "All-rounder" },
  { name: "Deepak Hooda", position: "All-rounder" },
  { name: "Harbhajan Singh", position: "Bowler" },
  { name: "Shahbaz Ahmed", position: "All-rounder" },
  { name: "Umesh Yadav", position: "Bowler" },
  { name: "Jaydev Unadkat", position: "Bowler" },
  { name: "Mukesh Kumar", position: "Bowler" },
  { name: "Avesh Khan", position: "Bowler" },
  { name: "Khaleel Ahmed", position: "Bowler" },
  { name: "T Natarajan", position: "Bowler" },
  { name: "Yash Dayal", position: "Bowler" },
  { name: "Akash Deep", position: "Bowler" },
  { name: "Vaibhav Arora", position: "Bowler" },
  { name: "Arshad Khan", position: "All-rounder" },
  { name: "Vijay Shankar", position: "All-rounder" },
  { name: "Riyan Parag", position: "All-rounder" },
  { name: "Dhruv Jurel", position: "Wicketkeeper" },
  { name: "Jitesh Sharma", position: "Wicketkeeper" },
  { name: "Abdul Samad", position: "All-rounder" },
  { name: "Aryan Juyal", position: "Wicketkeeper" },
  { name: "Rahmanullah Gurbaz", position: "Wicketkeeper" },
  { name: "Phil Salt", position: "Wicketkeeper" },
  { name: "Jonny Bairstow", position: "Wicketkeeper" },
  { name: "Alex Hales", position: "Batsman" },
  { name: "Finn Allen", position: "Batsman" },
  { name: "David Warner", position: "Batsman" },
  { name: "Jake Fraser-McGurk", position: "Batsman" },
  { name: "Harry Brook", position: "Batsman" },
  { name: "Moeen Ali", position: "All-rounder" },
  { name: "Daniel Sams", position: "All-rounder" },
  { name: "Kane Williamson", position: "Batsman" },
  { name: "Kyle Jamieson", position: "Bowler" },
  { name: "Obed McCoy", position: "Bowler" },
  { name: "Romario Shepherd", position: "All-rounder" },
  { name: "Odean Smith", position: "All-rounder" },
  { name: "Fazalhaq Farooqi", position: "Bowler" },
  { name: "Rahul Chahar", position: "Bowler" },
  { name: "Harpreet Brar", position: "Bowler" },
  { name: "Rahul Tripathi", position: "Batsman" },
  { name: "Priyank Panchal", position: "Batsman" },
  { name: "Ruturaj Dhane", position: "Batsman" },
  { name: "Devdutt Padikkal", position: "Batsman" },
  { name: "Mandeep Singh", position: "Batsman" },
  { name: "Karun Nair", position: "Batsman" },
  { name: "Robin Uthappa", position: "Wicketkeeper" },
  { name: "Suresh Raina", position: "Batsman" },
  { name: "Yusuf Pathan", position: "All-rounder" },
  { name: "Irfan Pathan", position: "All-rounder" },
  { name: "Ambati Rayudu", position: "Batsman" },
  { name: "Piyush Chawla", position: "Bowler" },
  { name: "Amit Mishra", position: "Bowler" },
  { name: "Murali Vijay", position: "Batsman" },
  { name: "Parthiv Patel", position: "Wicketkeeper" },
  { name: "Wriddhiman Saha", position: "Wicketkeeper" },
  { name: "Cheteshwar Pujara", position: "Batsman" },
  { name: "Hanuma Vihari", position: "Batsman" },
  { name: "Mayank Markande", position: "Bowler" },
  { name: "Karan Sharma", position: "Bowler" },
  { name: "Sandeep Sharma", position: "Bowler" },
  { name: "Shivam Mavi", position: "Bowler" },
  { name: "Kartik Tyagi", position: "Bowler" },
  { name: "Prasidh Krishna", position: "Bowler" },
  { name: "Navdeep Saini", position: "Bowler" },
  { name: "Ravi Rampaul", position: "Bowler" },
  { name: "Dwayne Bravo", position: "All-rounder" },
  { name: "Kieron Pollard", position: "All-rounder" },
  { name: "Dwaine Pretorius", position: "All-rounder" },
  { name: "Wayne Parnell", position: "Bowler" },
  { name: "Bhanuka Rajapaksa", position: "Batsman" },
  { name: "Dasun Shanaka", position: "All-rounder" },
  { name: "Charith Asalanka", position: "Batsman" },
  { name: "Pathum Nissanka", position: "Batsman" },
  { name: "Mohammad Nabi", position: "All-rounder" },
  { name: "Ishant Sharma", position: "Bowler" },
  { name: "Naveen-ul-Haq", position: "Bowler" },
  { name: "Mujeeb Ur Rahman", position: "Bowler" },
  { name: "Kusal Mendis", position: "Wicketkeeper" },
  { name: "Litton Das", position: "Wicketkeeper" },
  { name: "Shakib Al Hasan", position: "All-rounder" },
  { name: "Pragyan Ojha", position: "Bowler" },
  { name: "Darshan Nalkande", position: "Bowler" },
  { name: "Shivam Singh", position: "Bowler" },
  { name: "Rajat Patidar", position: "Batsman" },
  { name: "Anuj Rawat", position: "Wicketkeeper" },
  { name: "Suyash Prabhudessai", position: "All-rounder" },
  { name: "Mahipal Lomror", position: "All-rounder" },
  { name: "Shahbaz Nadeem", position: "Bowler" },
  { name: "Krishnappa Gowtham", position: "All-rounder" },
  { name: "Kuldeep Sen", position: "Bowler" },
  { name: "Yudhvir Singh", position: "Bowler" },
  { name: "Himmat Singh", position: "Batsman" },
  { name: "Aman Khan", position: "All-rounder" },
  { name: "Ajinkya Rahane", position: "Batsman" },
  { name: "Anukul Roy", position: "All-rounder" },
  { name: "Chetan Sakariya", position: "Bowler" },
  { name: "KM Asif", position: "Bowler" },
  { name: "Simarjeet Singh", position: "Bowler" },
  { name: "Shikhar Dhawan", position: "Batsman" },
  { name: "Baltej Dhanda", position: "Bowler" },
  { name: "Mohsin Khan", position: "Bowler" },
  { name: "Arshin Kulkarni", position: "Batsman" },
  { name: "Angkrish Raghuvanshi", position: "Batsman" },
  { name: "Manav Suthar", position: "Bowler" },
  { name: "Suyash Sharma", position: "Bowler" },
  { name: "Ayush Badoni", position: "Batsman" },
  { name: "Yash Thakur", position: "Bowler" },
  { name: "Gautam Gambhir", position: "Batsman" },
  { name: "Himanshu Sangwan", position: "Bowler" },
  { name: "Lalit Yadav", position: "All-rounder" },
  { name: "Ripal Patel", position: "All-rounder" },
  { name: "Vishnu Vinod", position: "Wicketkeeper" },
  { name: "Donovan Ferreira", position: "Wicketkeeper" },
  { name: "Tristan Stubbs", position: "Batsman" },
  { name: "Tanush Kotian", position: "Bowler" },
  { name: "Yash Dubey", position: "Batsman" },
  { name: "Nehal Wadhera", position: "Batsman" },
  { name: "Prabhsimran Singh", position: "Wicketkeeper" },
  { name: "Atharva Taide", position: "Batsman" },
  { name: "Jagadeesha Suchith", position: "All-rounder" },
  { name: "Vyshak Vijaykumar", position: "Bowler" },
  { name: "Mohit Rathee", position: "Bowler" },
  { name: "Swapnil Singh", position: "All-rounder" },
  { name: "Virender Sehwag", position: "Batsman" },
  { name: "Akash Madhwal", position: "Bowler" },
  { name: "Arjun Tendulkar", position: "Bowler" },
  { name: "Kumar Kartikeya", position: "Bowler" },
  { name: "Raghav Goyal", position: "Bowler" },
  { name: "Shams Mulani", position: "All-rounder" },
  { name: "Jalaj Saxena", position: "All-rounder" },
  { name: "Shivam Chauhan", position: "Batsman" },
  { name: "Sameer Rizvi", position: "Batsman" },
  { name: "Saurabh Kumar", position: "Bowler" },
  { name: "Stuart Binny", position: "All-rounder" },
  { name: "Manoj Tiwary", position: "Batsman" },
  { name: "Dinesh Karthik", position: "Wicketkeeper" },
  { name: "Ravi Bopara", position: "All-rounder" },
  { name: "Thisara Perera", position: "All-rounder" },
  { name: "Isuru Udana", position: "All-rounder" },
  // --- Real retained players not already covered above (see
  // mock-ipl-auction-mega.ts's RETAINED_PLAYERS) ---
  { name: "Abishek Porel", position: "Wicketkeeper" },
  { name: "Mayank Yadav", position: "Bowler" },
  // --- Additional real IPL-pool names (Wisden base-price-slab lists),
  // widening the pool so SQUAD_SIZE=20 x 10 teams has real slack ---
  { name: "Rilee Rossouw", position: "Batsman" },
  { name: "Steve Smith", position: "Batsman" },
  { name: "Gerald Coetzee", position: "Bowler" },
  { name: "Josh Inglis", position: "Wicketkeeper" },
  { name: "Adil Rashid", position: "Bowler" },
  { name: "Rassie Van Der Dussen", position: "Batsman" },
  { name: "James Vince", position: "Batsman" },
  { name: "Sean Abbott", position: "Bowler" },
  { name: "Jamie Overton", position: "Bowler" },
  { name: "David Willey", position: "Bowler" },
  { name: "Ben Duckett", position: "Batsman" },
  { name: "Colin Munro", position: "Batsman" },
  { name: "Sherfane Rutherford", position: "All-rounder" },
  { name: "Tom Curran", position: "Bowler" },
  { name: "James Neesham", position: "All-rounder" },
  { name: "Chris Jordan", position: "Bowler" },
  { name: "Jhye Richardson", position: "Bowler" },
  { name: "Tymal Mills", position: "Bowler" },
  { name: "Rovman Powell", position: "Batsman" },
  { name: "Alzarri Joseph", position: "Bowler" },
  { name: "Ashton Turner", position: "All-rounder" },
  { name: "Ashton Agar", position: "Bowler" },
  { name: "Michael Bracewell", position: "All-rounder" },
  { name: "Sam Billings", position: "Wicketkeeper" },
  { name: "Gus Atkinson", position: "Bowler" },
  { name: "Riley Meredith", position: "Bowler" },
  { name: "Adam Milne", position: "Bowler" },
  { name: "David Wiese", position: "All-rounder" },
  { name: "Ish Sodhi", position: "Bowler" },
  { name: "Keemo Paul", position: "All-rounder" },
  { name: "Matt Henry", position: "Bowler" },
  { name: "Lance Morris", position: "Bowler" },
  { name: "Ollie Robinson", position: "Bowler" },
  { name: "Billy Stanlake", position: "Bowler" },
  { name: "Olly Stone", position: "Bowler" },
  { name: "Fabian Allen", position: "All-rounder" },
  { name: "Shai Hope", position: "Wicketkeeper" },
  { name: "Taskin Ahmed", position: "Bowler" },
  { name: "Azmatullah Omarzai", position: "All-rounder" },
  { name: "KS Bharat", position: "Wicketkeeper" },
  { name: "Dilshan Madushanka", position: "Bowler" },
  { name: "Mohammad Waqar Salamkheil", position: "Bowler" },
  { name: "Tabraiz Shamsi", position: "Bowler" },
  { name: "Alick Athanaze", position: "Batsman" },
  { name: "Mark Chapman", position: "Batsman" },
  { name: "Samuel Hain", position: "Batsman" },
  { name: "Reeza Hendricks", position: "Batsman" },
  { name: "Brandon King", position: "Batsman" },
  { name: "Ibrahim Zadran", position: "Batsman" },
  { name: "Najibullah Zadran", position: "Batsman" },
  { name: "Brydon Carse", position: "Bowler" },
  { name: "Ben Cutting", position: "All-rounder" },
  { name: "Matthew Forde", position: "Bowler" },
  { name: "George Garton", position: "Bowler" },
  { name: "George Linde", position: "All-rounder" },
  { name: "Keshav Maharaj", position: "Bowler" },
  { name: "Wiaan Mulder", position: "All-rounder" },
  { name: "Matthew Short", position: "All-rounder" },
  { name: "Johnson Charles", position: "Batsman" },
  { name: "Varun Aaron", position: "Bowler" },
  { name: "Fareed Ahmad", position: "Bowler" },
  { name: "Wesley Agar", position: "Bowler" },
  { name: "Qais Ahmad", position: "Bowler" },
  { name: "Rehan Ahmed", position: "Bowler" },
  { name: "Ben Dwarshuis", position: "Bowler" },
  { name: "Richard Gleeson", position: "Bowler" },
  { name: "Md Shoriful Islam", position: "Bowler" },
  { name: "Spencer Johnson", position: "Bowler" },
  { name: "Siddharth Kaul", position: "Bowler" },
  { name: "Lahiru Kumara", position: "Bowler" },
  { name: "Blessing Muzarabani", position: "Bowler" },
  { name: "Richard Ngarava", position: "Bowler" },
  { name: "George Scrimshaw", position: "Bowler" },
  { name: "Barinder Sran", position: "Bowler" },
  { name: "Oshane Thomas", position: "Bowler" },
  { name: "Nuwan Thushara", position: "Bowler" },
  { name: "Sandeep Warrier", position: "Bowler" },
  { name: "Lizaad Williams", position: "Bowler" },
  { name: "Luke Wood", position: "Bowler" },
  { name: "Tom Kohler-Cadmore", position: "Wicketkeeper" },
  { name: "Benny Howell", position: "All-rounder" },
  { name: "Corbin Bosch", position: "All-rounder" },
  { name: "Kamlesh Nagarkoti", position: "Bowler" },
  { name: "Basil Thampi", position: "Bowler" },
  { name: "S Midhun", position: "Bowler" },
  { name: "Izharulhuq Naveed", position: "Bowler" },
  { name: "Priyansh Arya", position: "Batsman" },
  { name: "Saurav Chauhan", position: "Batsman" },
  { name: "Shubham Dubey", position: "Batsman" },
  { name: "Rohan Kunnummal", position: "Batsman" },
  { name: "Manan Vohra", position: "Batsman" },
  { name: "Raj Angad Bawa", position: "All-rounder" },
  { name: "Sarfaraz Khan", position: "Batsman" },
  { name: "Vivrant Sharma", position: "Batsman" },
  { name: "Atit Sheth", position: "Bowler" },
  { name: "Hrithik Shokeen", position: "All-rounder" },
  { name: "Ricky Bhui", position: "Batsman" },
  { name: "Kumar Kushagra", position: "Wicketkeeper" },
  { name: "Urvil Patel", position: "Wicketkeeper" },
  { name: "Vishnu Solanki", position: "Wicketkeeper" },
  { name: "Rasikh Dar", position: "Bowler" },
  { name: "Sushant Mishra", position: "Bowler" },
  { name: "Ishan Porel", position: "Bowler" },
  { name: "Akash Singh", position: "Bowler" },
  { name: "Kuldip Yadav", position: "Bowler" },
  { name: "Murugan Ashwin", position: "Bowler" },
  { name: "Pulkit Narang", position: "Bowler" },
  { name: "M. Siddharth", position: "Bowler" },
  { name: "Shiva Singh", position: "All-rounder" },
  { name: "Dinesh Bana", position: "Bowler" },
  { name: "Swastik Chhikara", position: "Batsman" },
  { name: "Rajat Dey", position: "Bowler" },
  { name: "Abhimanyu Easwaran", position: "Batsman" },
  { name: "Rithik Easwaran", position: "Batsman" },
  { name: "Chirag Gandhi", position: "Bowler" },
  { name: "Nikhil Gangta", position: "Batsman" },
  { name: "Sudip Gharami", position: "Batsman" },
  { name: "Ansh Gosai", position: "Batsman" },
  { name: "Azim Kazi", position: "Wicketkeeper" },
  { name: "Amandeep Khare", position: "Batsman" },
  { name: "Ankit Kumar", position: "Bowler" },
  { name: "Bhupen Lalwani", position: "Wicketkeeper" },
  { name: "Pukhraj Mann", position: "Batsman" },
  { name: "Tanmay Mishra", position: "Batsman" },
  { name: "Salman Nizar", position: "Batsman" },
  { name: "Akshat Raghuwanshi", position: "Batsman" },
  { name: "Ekant Sen", position: "Bowler" },
  { name: "Subhranshu Senapati", position: "Batsman" },
  { name: "Naushad Shaikh", position: "Bowler" },
  { name: "Dhruv Shorey", position: "Batsman" },
  { name: "Virat Singh", position: "Batsman" },
  { name: "Shashank Singh", position: "All-rounder" },
  { name: "Sumeet Verma", position: "Bowler" },
  { name: "PA Abdul", position: "All-rounder" },
  { name: "Murugan Abhishek", position: "Bowler" },
  { name: "Atharva Ankolekar", position: "Bowler" },
  { name: "Baba Aparajith", position: "Batsman" },
  { name: "Jass Inder Baidwan", position: "Batsman" },
  { name: "Rahul Buddhi", position: "Batsman" },
  { name: "Vaisakh Chandran", position: "Bowler" },
  { name: "Writtick Chatterjee", position: "Batsman" },
  { name: "Raj Chaudhary", position: "Bowler" },
  { name: "Ravi Chauhan", position: "Bowler" },
  { name: "Ashwin Das", position: "Batsman" },
  { name: "Aarya Desai", position: "Batsman" },
  { name: "Vineet Dhankhar", position: "Bowler" },
  { name: "Naman Dhir", position: "All-rounder" },
  { name: "Harsh Dubey", position: "All-rounder" },
  { name: "Prerit Dutta", position: "Wicketkeeper" },
  { name: "Shubhang Hegde", position: "Bowler" },
  { name: "Saransh Jain", position: "Bowler" },
  { name: "Duan Jansen", position: "All-rounder" },
  { name: "Mohammad Kaif", position: "Batsman" },
  { name: "Anshul Kamboj", position: "Bowler" },
  { name: "Mohd Arslan Khan", position: "Bowler" },
  { name: "Musheer Khan", position: "Batsman" },
  { name: "Sumit Kumar", position: "Bowler" },
  { name: "Manvanth Kumar", position: "Bowler" },
  { name: "Dev Lakra", position: "Batsman" },
  { name: "Nasir Lone", position: "Bowler" },
  { name: "Kaushik Maity", position: "Bowler" },
  { name: "Divij Mehra", position: "Batsman" },
  { name: "Mani Sankar Mura Singh", position: "Bowler" },
  { name: "Abid Mushtaq", position: "Bowler" },
  { name: "Sanjay Pahal", position: "Bowler" },
  { name: "Jitender Pal", position: "Bowler" },
  { name: "Saumy Pandey", position: "Bowler" },
  { name: "Ansh Patel", position: "All-rounder" },
  { name: "Sairaj Patil", position: "All-rounder" },
  { name: "Pradosh Paul", position: "Bowler" },
  { name: "Shubham Singh Pundir", position: "Bowler" },
  { name: "Atal Rai", position: "Bowler" },
  { name: "Abhimanyusingh Rajput", position: "All-rounder" },
  { name: "Ninad Rathva", position: "Bowler" },
  { name: "Rohit Rayudu", position: "All-rounder" },
  { name: "Aniketh Reddy", position: "All-rounder" },
  { name: "Mohit Redkar", position: "Batsman" },
  { name: "Akash Sengupta", position: "Batsman" },
  { name: "Ashutosh Sharma", position: "Batsman" },
  { name: "Shivalik Sharma", position: "Batsman" },
  { name: "Suryansh Shedge", position: "All-rounder" },
  { name: "Aradhya Shukla", position: "Batsman" },
  { name: "Utkarsh Singh", position: "Bowler" },
  { name: "Vishwanath Pratap Singh", position: "Bowler" },
  { name: "Prenelan Subrayen", position: "Bowler" },
  { name: "Ravi Teja", position: "Batsman" },
  { name: "Tanay Thyagarajann", position: "Batsman" },
  { name: "Akash Vashisht", position: "Bowler" },
  { name: "Mohit Ahlawat", position: "Batsman" },
  { name: "G. Ajitesh", position: "Wicketkeeper" },
  { name: "Avanish Rao Aravelly", position: "Wicketkeeper" },
  { name: "L.R. Chethan", position: "Bowler" },
  { name: "Gourav Choudhary", position: "Bowler" },
  { name: "Harvik Desai", position: "Wicketkeeper" },
  { name: "Shakir Gandhi", position: "Bowler" },
  { name: "Sumit Ghadigaonkar", position: "Batsman" },
  { name: "Baba Indrajith", position: "Batsman" },
  { name: "Bhagmender Lather", position: "Bowler" },
  { name: "Anmol Malhotra", position: "All-rounder" },
  { name: "Robin Minz", position: "Wicketkeeper" },
  { name: "Darshan Misal", position: "Bowler" },
  { name: "Nikhil Naik", position: "Batsman" },
  { name: "Prasad Pawar", position: "All-rounder" },
  { name: "Mahesh Pithiya", position: "Bowler" },
  { name: "William Salzmann", position: "Bowler" },
  { name: "Bipin Saurabh", position: "Bowler" },
  { name: "B.R. Sharath", position: "Wicketkeeper" },
  { name: "K.L. Shrijith", position: "Batsman" },
  { name: "Avneesh Sudha", position: "All-rounder" },
  { name: "Aditya Tare", position: "Wicketkeeper" },
  { name: "Nihal Ullal", position: "Wicketkeeper" },
  { name: "Mohit Avasthi", position: "Bowler" },
  { name: "Ottneil Baartman", position: "Bowler" },
  { name: "Basit Bashir", position: "Bowler" },
  { name: "Waseem Bashir", position: "Bowler" },
  { name: "Sachin Bhosale", position: "Bowler" },
  { name: "Devendra Singh Bora", position: "Bowler" },
  { name: "Gurnoor Singh Brar", position: "Bowler" },
  { name: "Nandre Burger", position: "Bowler" },
  { name: "Saurabh Dubey", position: "Bowler" },
  { name: "Mrinmoy Dutta", position: "Bowler" },
  { name: "Vishal Godara", position: "Bowler" },
  { name: "Money Grewal", position: "Bowler" },
  { name: "Arpit Guleria", position: "Bowler" },
  { name: "Mukhtar Hussain", position: "Bowler" },
  { name: "Sakib Hussain", position: "All-rounder" },
  { name: "Shamar Joseph", position: "Bowler" },
  { name: "Shubham Kapse", position: "Bowler" },
  { name: "Devang Karamta", position: "Bowler" },
  { name: "Kulwant Khejroliya", position: "Bowler" },
  { name: "Ravi Kumar", position: "Bowler" },
  { name: "Ashwani Kumar", position: "Bowler" },
  { name: "Raj Limbani", position: "Bowler" },
  { name: "Kwena Maphaka", position: "Bowler" },
  { name: "Lukman Hussain Meriwala", position: "Bowler" },
  { name: "Venkatesh Muralidhara", position: "Bowler" },
  { name: "William O'Rourke", position: "Bowler" },
  { name: "Rakshan Readdi", position: "Batsman" },
  { name: "Manish Reddy", position: "Batsman" },
  { name: "Monish Reddy", position: "Batsman" },
  { name: "Akhin Sathar", position: "Bowler" },
  { name: "Divesh Sharma", position: "Bowler" },
  { name: "Ashok Sharma", position: "Bowler" },
  { name: "Abhilash Shetty", position: "Bowler" },
  { name: "Rahul Shukla", position: "Bowler" },
  { name: "Manit Singh", position: "Bowler" },
  { name: "Gurjapneet Singh", position: "Bowler" },
  { name: "Paul Van Meekeren", position: "Bowler" },
  { name: "Nitin Verma", position: "Bowler" },
  { name: "Chris Wood", position: "Bowler" },
  { name: "Ben Stokes", position: "All-rounder" },
  { name: "Vaibhav Suryavanshi", position: "Batsman" },
  { name: "Allah Ghazanfar", position: "Bowler" },
  { name: "Digvesh Singh", position: "Bowler" },
  { name: "Pankaj Yadav", position: "Bowler" },
  { name: "Kunal Singh Rathore", position: "Wicketkeeper" },
  { name: "Shivam Sharma", position: "Bowler" },
  { name: "Bhuwan Rohilla", position: "Bowler" },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function jitter(spread: number): number {
  return (Math.random() * 2 - 1) * spread;
}

/** rating is out of 100; battingRating/bowlingRating/fieldingRating are out
 * of 10 (lib/teamStrength.ts's own convention) — synthetic (tier + jitter,
 * skewed by position) so playerValue.ts's skill/value scores aren't
 * degenerate, per the plan's disclosed "not a factual skill ranking" risk. */
export function ratingsForPlayer(
  category: string,
  position: MockPlayerPosition
): { rating: number; battingRating: number; bowlingRating: number; fieldingRating: number } {
  const tierIndex = CATEGORIES.findIndex((c) => c.name === category);
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
    // All-rounder
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

/** Builds the full ~490-player pool, assigning each player to a tier/
 * category in a pyramid shape (fewer at the top, more at the bottom),
 * scaled up from the original 230-player pyramid (6/10/16/24/34/40/46/54)
 * by the same proportions now that SQUAD_SIZE=20 x 10 teams = 200 slots
 * needed per auction requires real statistical slack. */
export function buildPlayerPool(): MockPlayer[] {
  const tierCounts: Record<string, number> = {
    Marquee: 13,
    Elite: 21,
    "A-Tier": 34,
    "B-Tier": 51,
    "C-Tier": 72,
    "D-Tier": 85,
    "E-Tier": 98,
    Uncapped: 116,
  };

  const players: MockPlayer[] = [...ANCHORS];
  // ANCHORS already cover Marquee (6) and Elite (10) fully, and 13 of
  // A-Tier's 16 — top up A-Tier with 3 filler names, then distribute the
  // rest of FILLER_NAMES across B-Tier down to Uncapped in order.
  let fillerIndex = 0;
  const takeFiller = (count: number, category: string) => {
    for (let i = 0; i < count; i++) {
      const f = FILLER_NAMES[fillerIndex % FILLER_NAMES.length];
      fillerIndex += 1;
      players.push({ name: f.name, position: f.position, category });
    }
  };

  const anchorCountByTier: Record<string, number> = {};
  for (const a of ANCHORS) anchorCountByTier[a.category] = (anchorCountByTier[a.category] ?? 0) + 1;

  for (const [tier, target] of Object.entries(tierCounts)) {
    const already = anchorCountByTier[tier] ?? 0;
    if (already < target) takeFiller(target - already, tier);
  }

  return players;
}
