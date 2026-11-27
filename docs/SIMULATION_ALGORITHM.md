# How the Simulate Engine Decides Who You'll End Up With

**Audience:** team managers, analysts, and anyone sitting at the auction table using the
Analytics v2 **Simulate** tab.
**Purpose:** explain, in plain terms, what the five inputs (budgets, wishlist, avoids,
predictions, live auction state) actually do to the outcome — with real numbers from the IPL
2027 Mini Auction mock data — and how to use the tool *during* a live auction, not just before
one starts.

---

## 1. What "Simulate" actually is

Clicking **Run simulation** doesn't predict one outcome. It plays out the *rest* of the auction
from exactly where it stands right now, hundreds of times in a row, each time with different
random rolls for how hard rivals contest each player. Every one of those replays is called a
**run**. Across all the runs, the engine counts things like "how often did I actually get Trent
Boult" or "how much budget did I have left over on average" — that's the scorecard you see.

Nothing here is written to the database. It's a pure what-if calculator: it reads your current
live state, computes, and shows you the result. You can run it as many times as you like, with
as many runs as you like, and nothing about the real auction changes.

## 2. The five things that go into every run

| Input | What it represents | Where you set it |
|---|---|---|
| **Your budget targets** | How much you intend to spend, on average, per player in each category (e.g. "Marquee players should average around 4500 to me") | Set Budgets tab |
| **Your rival estimates** | Your own private guess at what *each other team* intends to spend per category | Set Budgets tab |
| **Your wishlist (must-haves / avoids)** | Specific players you're committed to winning, or specific players you will not bid on at all | Wish list & Predictions tab |
| **Your predictions** | A private guess, per remaining player, about who wins them and for roughly how much — or a guess that nobody wins them at all | Wish list & Predictions tab |
| **Live auction state** | Every player still available, every team's actual remaining budget and open slots, every sale that's already happened | Read automatically, always current |

The first four are *your* strategic inputs — everything you've typed in. The fifth is simply
reality as of the second you click Run. We'll come back to why that matters a lot for using this
mid-auction (§10).

All the numbers below are real, pulled directly from the **IPL 2027 Mini Auction** mock data,
specifically Kolkata Knight Riders' (KKR) saved strategy at the time of writing:

- **Categories (base price / minimum bid increment):** Marquee 200/50, Elite 150/25, Premium
  125/25, A-Tier 100/25, B-Tier 75/10, C-Tier 50/10, D-Tier 40/10, E-Tier 30/5, Uncapped 20/5.
- **KKR's roster:** 25 total slots, 17 already filled, 6225 budget remaining.
- **KKR's must-haves:** Trent Boult (Marquee), Rahul Tripathi (B-Tier).
- **KKR's avoids:** Adam Milne (Marquee), Mayank Agarwal (B-Tier), Saransh Jain (B-Tier), Ashton
  Agar (Premium).
- **KKR's budget targets:** Marquee 4500, Elite 650, Premium 500, A-Tier 400. (No target set for
  B-Tier — Rahul Tripathi, a must-have, sits in that untargeted category; §3's worked example
  below covers exactly what that means for his price.)
- **KKR's rival estimates (Marquee only, partial):** Chennai Super Kings 4000, Delhi Capitals
  5000. (KKR hasn't bothered estimating every rival in every category — that's normal and fine;
  the engine only uses what you've actually filled in.)
- **KKR's predictions (sample):** David Warner predicted **unsold**; Trent Boult predicted with
  no specific winner but a minimum price of **2900**; Avesh Khan predicted to be won by **Mumbai
  Indians** with a minimum of 500.
- **Already sold this auction (Marquee, 8 players):** Kohli→RCB 2100, Cummins→SRH 1800,
  Pant→DC 1500, Pooran→LSG 2100, Iyer→PBKS 2675, Jaiswal→RR 1800, Klaasen→SRH 2300, Rashid
  Khan→GT 1800 — a live Marquee average of **2009**.

## 3. How YOUR team decides whether to bid on the player on the clock

For every remaining player, in order, the engine asks one question for your own team: *would
you bid, and up to how much?* This is the exact same logic the **Live bid guidance** panel shows
you during a real auction — Simulate just runs it automatically, hundreds of times, instead of
waiting for you to read it off the screen.

The checks run in this order, and the first one that applies wins:

1. **It's on your avoid list → you pass.** No exceptions, unless you've also predicted a
   specific rival wants it badly (see "spoiler bids" in §7).
2. **You can't legally afford it → you pass.** If bidding would leave you unable to fill your
   remaining slots at the cheapest prices still realistically available, the engine won't let
   you (or any team) bid past that line. This is the same rule the real server enforces on
   every bid.
3. **It's a must-have → you bid, capped at your budget target for that category** (not your
   full legal max — budgets take priority over the wishlist, explained in §4). If you haven't
   set a target for that category at all, there's nothing to cap against, so a must-have goes
   all the way to your legal max.
4. **Another must-have in the same category hasn't been resolved yet → you hold back
   entirely.** Not a smaller, cautious bid — a full pass. The idea is to protect the budget for
   the priority pick; once that other must-have is won or lost, this category opens back up to
   ordinary bidding for the rest of the run.
5. **Otherwise → you bid up to your budget target** (or the live category average if you
   haven't set one, or your flat legal max if neither exists yet).

### Worked example: Rahul Tripathi (must-have, B-Tier, no budget target set)

B-Tier's base price is 75. KKR has Tripathi as a must-have but never set a B-Tier budget
target. Rule 3 applies: no target to cap against, so the suggested bid goes all the way to
KKR's legal max for that pick — say KKR's legal max at that point in a run comes out to 480 (a
function of its remaining budget and how many cheap slots it still needs to protect). KKR
becomes a candidate to win Tripathi at up to 480. Compare this to Trent Boult below, where a
real target *does* apply and caps the number hard.

## 4. Budgets aren't a ceiling per player — they're one pool per category

This is the single most important mechanic to understand, and it trips people up: a budget
target of "4500 for Marquee" does **not** mean "I'll pay up to 4500 for every Marquee player."
It means **4500 total, across every Marquee player you buy, for the rest of this run.**

Every time you win a player in a category, whatever you paid comes off that category's
remaining pool before the *next* player in it is even evaluated. Spend 2800 of your 4500
Marquee target on one win, and the next Marquee evaluation — must-have or not — only has 1700
left to work with, not a fresh 4500.

**And it waterfalls.** Categories are worked through highest-base-price first (Marquee, then
Elite, then Premium, then A-Tier, …). Whatever's left of a category's target once you're done
bidding in it — rather than being wasted — rolls down into the *next category you also set a
target for*, skipping any category you didn't bother targeting.

**Example, using KKR's real targets (Marquee 4500 → Elite 650 → Premium 500 → A-Tier 400):**
Suppose across a run KKR only ends up spending 3800 of its 4500 Marquee allowance (it lost a
couple of contested Marquee lots to richer rivals, or simply ran out of Marquee players it
wanted). The unused **700** doesn't disappear — it rolls straight into Elite, so for the rest of
that run KKR is effectively working with an Elite target of **1350** (650 + 700), not 650. If
Elite also finishes under its (now-boosted) allowance, whatever's left after that rolls into
Premium, and so on down the chain.

A category you never set a target for (B-Tier, C-Tier, etc. for KKR) never receives a hand-down
and is never a source of one either — it's simply unconstrained, bid on purely by the ordinary
rules in §3.

## 5. How rivals decide whether to bid

Your own team's decisions are deterministic — same inputs, same answer, every time. Every rival
is **randomized**, because you don't actually know their strategy. Two things combine into one
probability per rival, per player:

- **How rich they are relative to the richest eligible bidder on this lot** — a team sitting on
  a much bigger legal budget than its competition contests more often (floor 15%, ceiling 85%,
  so even the poorest team occasionally still tries, and even the richest doesn't win
  automatically every time).
- **How urgent their own roster need is** — as a team's open slots start catching up to how many
  lots are even left in the whole auction, this probability climbs toward certainty. A team
  simply poorer than its rivals still gets desperate near the end, rather than passively
  finishing with empty slots and unspent money.

Whichever of the two is higher wins out. If a rival's random roll clears that probability, it
becomes a candidate at a randomized amount somewhere between the live category average and a
"fair share" ceiling (roughly 3× its average remaining budget per remaining slot — not its
entire bankroll, which would unrealistically assume every other slot gets filled for free).

**Your rival estimates matter here too.** If you've told the engine you expect Chennai Super
Kings to spend about 4000 on Marquee this auction (KKR's real estimate), then once CSK's
simulated *in-run* Marquee spend reaches that 4000, CSK stops being considered a contender for
any further Marquee player for the rest of that run — exactly the same "stop once the budget's
used up" logic your own targets get. An un-estimated rival (KKR never set one for, say, Royal
Challengers Bengaluru's Marquee spend) is never capped this way — the engine has no belief to
enforce.

## 6. Predictions: not a guess about the future — a belief that overrides the budget math

A **prediction** is the strongest input you can give the engine, because it's treated as
something you believe you *know*, not just a plan. It works two different ways depending on
whether you named a winner:

- **You named a specific team as the winner** (e.g. "Avesh Khan goes to Mumbai Indians"): that
  team wins the player, deterministically, in every single run — no randomness, no contest.
  The price still has to be one Mumbai Indians can legally afford; if their budget situation in
  that run genuinely can't stretch to it, the engine falls back to an ordinary contested lot
  instead of forcing an impossible sale.
- **You didn't name a winner** (a price-only guess, like Trent Boult's or Ben Stokes' real KKR
  predictions above): nobody is forced to win it, but your price belief still applies as a
  **floor and/or ceiling on whoever does**, you included. If you set a minimum of 2900 and
  nobody was going to pay that much, the price still gets pulled up to 2900 — the sale simply
  costs more than anyone's own strategy wanted, because your belief about the market says it
  will.

### Worked example: Trent Boult, must-have, with a predicted minimum of 2900

Say KKR has already spent 2000 of its 4500 Marquee target earlier in this particular run, so
2500 is left in the pool when Boult comes up.

1. **Your own bid, from §3's must-have rule:** capped at the remaining Marquee pool → **2500**.
2. **The prediction's floor applies to the whole lot, not just you:** Boult's predicted minimum
   is 2900 — with no named winner, that number isn't "KKR's belief about KKR," it's "KKR's belief
   about the market." So *every* candidate's price (including Mumbai Indians, if they happen to
   contest too) gets pulled up to at least 2900, provided they can legally afford it.
3. **If a rival also ends up a candidate at, say, 2200** (a legitimate contested bid under §5),
   their price *also* gets floored to 2900 by the same rule.
4. Both candidates now sit at exactly 2900 — a tie. The engine coin-flips between them.

The practical lesson: a prediction can make you pay *more* for your own must-have than your
budget target alone would have suggested, and it can do the same to a rival. It's a belief
about the market, applied evenly, not a tool that only helps you.

## 7. Avoids, spoiler bids, and "unsold"

Marking a player **avoid** means your own team passes on them completely — you're never a
candidate to win that lot (there's no "budget cap" exception for an avoid; it's absolute). KKR's
real avoid list — Adam Milne, Mayank Agarwal, Saransh Jain, Ashton Agar — simply never shows up
as a KKR win in any run.

There's one exception: a **spoiler bid**. If you've also predicted a specific rival wants an
avoid-listed player badly, the engine will suggest bidding them up to about 90% of your
predicted price for that rival — deliberately short of it, not matching it — purely to make the
rival pay more, with the explicit risk flagged that you could end up accidentally winning it
yourself if nobody else shows up. (None of KKR's real
avoids currently have a matching prediction, so this doesn't fire for KKR today — it's described
here so you know the mechanic exists if you ever pair the two.)

**"Unsold"** has two separate meanings depending on where it comes from:

- **You predicted it unsold** (KKR's real prediction for David Warner, Shivam Mavi, and
  Mohammad Nabi): the engine honors that unconditionally — nobody buys the player in that run,
  full stop.
- **Nobody becomes a candidate at all**, with no prediction involved: this can happen simply
  because every team that was eligible rolled against contesting it, or every team's own
  strategy (yours included) passed on it. It's reported separately in the results — see §9 —
  specifically so you can tell "I chose to pass on an affordable player" apart from "I genuinely
  couldn't afford it."

## 8. The desperation fallback — a safety net, not a strategy

Every rule above is a *recommendation*, not a hard veto on your own team — except the avoid tag,
which always is one. If, at some point in a run, the number of your own remaining open slots is
about to exceed the number of lots left in the entire auction, the engine overrides a plain pass
(whether from an exhausted budget cap, or simply not being a priority pick) and has you try
anyway, rather than mathematically guaranteeing you finish with an empty slot. It still respects
whatever's actually left of the category's own budget pool (floored at the base price, never
unbounded), and it still never touches an avoid-listed player under any circumstance. This is
why a run can show you winning something slightly outside your stated plan near the very end —
it's the engine refusing to let a plan produce an impossible outcome, not a bug in the plan.

## 9. Reading what comes back

- **Plan summary** (shown before you even click Run): your current budgets, wishlist, and
  predictions, so you can sanity-check what you're about to simulate against before reading 100
  runs' worth of results.
- **Completion status:** how many of the runs actually filled your roster (or hit whatever
  minimum squad size you set — not every real auction requires every slot filled). If a
  meaningful number fell short, you get a breakdown: ran out of legal budget entirely (a hard
  wall), lost affordable picks to a rival (contention, not a budget problem), or picks went
  unsold while you could have afforded them (your own strategy — must-have ordering, an avoid
  tag, or simply not being selected as a contender — passed on something affordable).
- **Scorecard:** your average leftover budget across valid runs, your most likely final squad
  and how often each player actually lands on it, and — for every wishlist/avoid/predicted
  player — how often you actually won them, lost them, or (for an avoid) accidentally ended up
  with them anyway, plus the average price paid when you did win a must-have.
- **Per-run detail:** pick any individual run and see every team's actual resulting roster, not
  just the aggregate.

## 10. Running this live, mid-auction — not just beforehand

Everything above reads live state fresh, every single time you click Run. There is no caching
and nothing to "refresh" separately:

- The moment a player is hammered down at the real table, that sale, the winning team's new
  budget/slot count, and the shrinking pool of remaining players are all immediately what the
  *next* click of Run sees. You don't need to re-enter anything for that part.
- Your own wishlist, avoids, budget targets, and predictions all **save automatically** as you
  edit them — there's no separate "save" step to remember before re-running.

**A practical workflow for someone sitting at the table:**

1. Before the session starts (or during a lull), set your must-haves/avoids, budget targets per
   category, rival estimates, and any price predictions you're confident about.
2. Run a batch (the default is 100 runs) to get a baseline scorecard — what you're likely to end
   up with, and where the risk is.
3. As the auction proceeds and specific players sell for specific prices, two things happen on
   their own: the live averages per category shift (your own un-targeted bidding and anyone
   still relying on the live-average fallback in §3 automatically reacts to this), and your
   remaining budget/slots shrink to match reality.
4. If something notable changes your read of the room — a rival clearly spending far more or
   less aggressively than expected, a player you predicted unsold actually selling, your own
   priorities shifting — update your wishlist/budget targets/predictions right there (they save
   instantly) and click Run again. You're always simulating "the rest of the auction from this
   exact second," never a stale snapshot from when you first opened the tab.
5. Watch the **shortfall reasons** (§9) if completion starts dropping — it tells you *why* you're
   trending short (budget wall vs. lost contests vs. your own strategy passing on affordable
   players), which is a much more actionable signal mid-auction than the raw completion
   percentage alone.

Because a batch of 100 runs is pure in-memory arithmetic (nothing is written to the database),
re-running costs you seconds, not minutes — there's no real cost to checking again after every
few lots if you want to.

## 11. Saving and comparing named strategies

Everything above describes one live, continuously-editable state. The bar above the tab strip
(visible no matter which tab you're on, since a strategy spans both Set Budgets and Wish list &
Predictions) lets you name and keep more than one version of it, so you can try an idea, check
what Simulate thinks of it, and get back to where you started without losing anything.

- **Save current as…** captures everything at once — must-haves, avoids, your budget targets,
  every rival estimate, and every prediction — under the name you give it. Saving under a name
  that already exists overwrites that saved copy; the save-as box starts pre-filled with
  whichever strategy is currently active, so change the name there if you want a new, separate
  copy instead of overwriting it.
- **Load** overwrites live state with a saved snapshot — must-haves, avoids, budget targets,
  rival estimates, and predictions all switch over together. Simulate needs no separate step
  afterward: the next time you click Run, it reads this freshly-loaded state automatically, the
  same way it always reads whatever's live.
- **Editing after a load never writes back into the saved copy.** Every toggle and every cell
  still only autosaves to *live* state, exactly as described throughout this document — the
  named strategy you loaded stays exactly as it was until you explicitly save again. This means
  you can load "Plan A," experiment freely, and either save those changes back into "Plan A" by
  name, or save them under a new name to keep both versions side by side, entirely your choice.
- **Switching to a different saved strategy while live state has unsaved changes prompts you to
  save first**, so an experiment never gets silently lost by loading over it. Reloading the
  strategy that's already active skips that prompt — it's treated as "revert to what I last
  saved here," not a conflict with itself.

---

## Appendix: real engine output, not illustration

Every number in this appendix is a real result from the simulation engine — the exact same code
the Simulate tab calls — run against real, live IPL 2027 Mini Auction data. 100 runs, a fixed
seed, so every figure here is exactly reproducible.

### A1. KKR's full configuration at a glance

| | Value |
|---|---|
| Roster | 25 total slots, 17 filled, 8 open |
| Budget remaining | 6225 |
| Must-haves | Trent Boult (Marquee), Rahul Tripathi (B-Tier) |
| Avoids | Adam Milne (Marquee), Mayank Agarwal (B-Tier), Saransh Jain (B-Tier), Ashton Agar (Premium) |
| Budget targets | Marquee 4500, Elite 650, Premium 500, A-Tier 400 — **no target set for B-Tier** |
| Rival estimates (Marquee) | Chennai Super Kings 4000, Delhi Capitals 5000 (other teams left un-estimated) |
| Predictions (sample) | David Warner → unsold; Trent Boult → no team, min 2900; Avesh Khan → Mumbai Indians, min 500 |

### A2. Aggregate results across 100 real runs

**Budget remaining:** min 30, max 230, average 132.75 — KKR finishes every single run solvent,
never remotely close to broke.

**Must-have outcomes:**

| Player | Won | Avg. price when won |
|---|---|---|
| Trent Boult | 100/100 | **4500**, every single time |
| Rahul Tripathi | 100/100 | 473 |

**Avoid outcomes:**

| Player | Won by KKR anyway | Won by someone else | Still unresolved |
|---|---|---|---|
| Adam Milne | 0/100 | 98 | 2 |
| Mayank Agarwal | 0/100 | 3 | 97 |
| Saransh Jain | 0/100 | 6 | 94 |
| Ashton Agar | 0/100 | 90 | 10 |

Zero across the board in the "won by KKR anyway" column — the avoid tag held in every run, with
no exceptions.

**Most likely squad (every player that showed up in at least a third of the 100 runs):**

| Player | Category | Frequency |
|---|---|---|
| Trent Boult | Marquee | 100% |
| Rahul Tripathi | B-Tier | 100% |
| Kuldeep Sen | B-Tier | 80% |
| Umran Malik | B-Tier | 79% |
| Karun Nair | B-Tier | 79% |
| Deepak Hooda | B-Tier | 69% |
| Billy Stanlake | Premium | 35% |
| Kyle Mayers | Premium | 33% |

The single most frequently *recurring exact combination* — Boult, Tripathi, Kyle Mayers, Karun
Nair, Kuldeep Sen, Deepak Hooda, and Umran Malik together — matched in all 100/100 runs.

### A3. Why Boult's price never moved: a real example of the depleting-pool cap in action

Boult's price was **exactly 4500 in every one of the 100 runs**, with zero variance. That's not
a coincidence or a rounding artefact — it's §4's depleting-pool rule, observed directly: in
every single run, KKR never ends up winning any *other* Marquee player before Boult comes up
(they're either won by rivals or go unsold while KKR is deciding in other categories), so the
full, untouched 4500 Marquee allowance is still sitting there when Boult is evaluated. His
predicted minimum of 2900 (§6) never actually changes anything here, because 4500 already sits
comfortably above it — the budget cap, not the prediction, is what's binding for Boult.

### A4. Why Tripathi's price floated at 473 instead of a fixed number

Unlike Boult, Tripathi's category (B-Tier) has **no budget target set** — rule 3 in §3 sends the
suggested bid all the way to KKR's legal max instead of a fixed cap. By the time B-Tier comes up
in a run, KKR's *actual* legal max depends on everything that already happened earlier in that
same run (how much Marquee/Elite/Premium/A-Tier spending ate into the budget first), so it's
genuinely different run to run — which is exactly why the price floats around an average of 473
instead of landing on one repeatable number the way Boult's did.

### A5. One full real run, Marquee category only (seed 42)

```
Jonny Bairstow       → Royal Challengers Bengaluru   3000  (contested)
Shimron Hetmyer      → Gujarat Titans                3700  (contested)
Ben Sears            → Punjab Kings                  2350  (contested)
Bevon Jacobs         → Royal Challengers Bengaluru   2750  (contested)
Anrich Nortje        → Chennai Super Kings            2350  (contested)
Matheesha Pathirana  → Lucknow Super Giants           2350  (contested)
Rahmanullah Gurbaz   → Delhi Capitals                 2300  (contested)
Fazalhaq Farooqi     → Punjab Kings                   2000  (contested)
Gerald Coetzee       → Delhi Capitals                 1700  (contested)
Tom Curran           → Sunrisers Hyderabad            1650  (contested)
Adam Milne           → Lucknow Super Giants           1650  (contested)   ← KKR's avoid, won by someone else, as expected
Shai Hope            → Chennai Super Kings            1550  (contested)
Deepak Chahar        → Gujarat Titans                 1350  (contested)
David Warner         → UNSOLD                                            ← KKR's predicted-unsold, honored exactly
Avesh Khan           → Mumbai Indians                 2100  (predicted)  ← KKR's named-winner prediction, honored exactly
Sam Billings         → Rajasthan Royals               1300  (contested)
Trent Boult          → Kolkata Knight Riders          4500  (self)       ← the must-have, capped at the full Marquee pool
Mahli Beardman       → Royal Challengers Bengaluru    1300  (contested)
Spencer Johnson      → Sunrisers Hyderabad            1150  (contested)
Devon Conway         → Delhi Capitals                 1200  (contested)
Rachin Ravindra      → Punjab Kings                   1000  (contested)
Jhye Richardson      → Lucknow Super Giants            950  (contested)
Daryl Mitchell       → Chennai Super Kings              950  (contested)
Wanindu Hasaranga    → Rajasthan Royals                750  (contested)
Ben Stokes           → Mumbai Indians                 1450  (contested)
Will O'Rourke        → Lucknow Super Giants             500  (contested)
Sonny Baker          → Sunrisers Hyderabad              650  (contested)
Jake Fraser-McGurk   → Rajasthan Royals                400  (contested)
Mujeeb Ur Rahman     → Sunrisers Hyderabad              350  (contested)
```

Every single thing described in §6 and §7 shows up for real in this one run: the named-winner
prediction (Avesh Khan → Mumbai Indians) resolved deterministically, the predicted-unsold guess
(David Warner) was honored with no sale at all, the avoid tag (Adam Milne) went to someone else
and was never a KKR candidate, and the must-have (Boult) landed exactly at the category's full
budget cap.

### A6. Reading a real shortfall: 0 of 100 runs filled KKR's full squad — and exactly why

Not every real result is a flattering one, and that's exactly when the shortfall diagnosis in
§9 earns its place — it tells you *why* a number like this happened instead of leaving you to
guess. Across all 100 runs, KKR never finished with its full 25-player squad. One representative
incomplete run's diagnosis:

```
slotsStillNeeded: 3
ranOutOfLegalBudget: false
eligibleLotsLostToRivals: 36
lotsWentUnsoldWhileEligible: 35
```

Read together with the budget-remaining range above (never below 30, averaging 132.75), the
story is unambiguous: **this has nothing to do with money.** `ranOutOfLegalBudget: false` means
KKR was never actually priced out. The real cause is spread across two things — losing 36
contested lots to richer or more urgent rivals over the course of the rest of the auction, and
35 more lots going completely unsold while KKR could have afforded them (its own strategy —
category priority ordering, or simply not being selected as a contender by the engine's
richness/urgency model — passed on them). Note these two counts accumulate over *everything*
left in the auction from that point on, not just KKR's next few picks, which is why they look
large relative to the 3 slots actually missing — they're measuring contention across the whole
remaining field, not a narrow window. The practical takeaway for someone at the table: with this
exact wishlist/budget configuration, KKR's last few slots are a genuine coin-toss against the
field, not a planning mistake — which is exactly the kind of thing worth knowing *before* the
room gets there, not after.

### A7. Other real teams' seeded strategies, for comparison

| Team | Must-haves | Avoids | Budget targets |
|---|---|---|---|
| Punjab Kings | Riley Meredith (Elite), Deepak Hooda (B-Tier) | Jhye Richardson (Marquee) | Elite 190, B-Tier 90 |
| Rajasthan Royals | Shimron Hetmyer (Marquee), Tushar Deshpande (A-Tier) | Kyle Mayers (Premium) | Marquee 470, A-Tier 130 |
| Sunrisers Hyderabad | David Warner (Marquee), Shimron Hetmyer (Marquee) | Jake Fraser-McGurk (Marquee) | Marquee 520 |

Notice Shimron Hetmyer is a must-have for *two different teams* (Rajasthan Royals and Sunrisers
Hyderabad) at the same time — a direct, real illustration of why must-haves are never a
guarantee: in A5's run above, he actually sold to neither of them, going to Gujarat Titans for
3700 instead. A must-have caps what *you're* willing to pay and how hard you try — it says
nothing about what everyone else at the table is willing to do.

### A8. A second real team: Rajasthan Royals, on a much tighter budget

Same engine, same 100 runs, same fixed seed — run from Rajasthan Royals' own saved strategy
instead of KKR's. RR is a useful second data point precisely because its situation is the
opposite of KKR's: a much tighter remaining budget, no rival estimates or predictions set at
all, and (as shown below) a must-have budget target set well below what the category actually
costs.

| | Value |
|---|---|
| Roster | 25 total slots, 19 filled, 6 open |
| Budget remaining | 2625 — much tighter than KKR's 6225 |
| Must-haves | Shimron Hetmyer (Marquee), Tushar Deshpande (A-Tier) |
| Avoids | Kyle Mayers (Premium) |
| Budget targets | Marquee 470, A-Tier 130 |
| Rival estimates / Predictions | **none set** — RR's manager hasn't filled either in |

**Aggregate across the 100 real runs:**

- **Budget remaining: min 0, max 0, average 0.** Not approximately zero — *exactly* zero, every
  single run. RR spends down to the last rupee every time.
- **Completion: 100/100** — despite that razor-thin margin, RR fills its full 25-slot squad in
  every run. Contrast this directly with KKR's 0/100 in A6, despite KKR having nearly 2.5× the
  spare budget — completion is about contention and slot math, not how much money you're
  sitting on.
- **Shimron Hetmyer: won 0/100, lost 100/100.** Not unlucky — guaranteed. Hetmyer's real going
  rate (3700 to Gujarat Titans in the exact run shown in A5, and the same real contested result
  here too, independent of whose perspective the snapshot is run from) sits far above RR's own
  470 Marquee target. Because a must-have's bid is capped at `min(legal max, budget target)`
  (§3, rule 3), RR's own candidate bid for Hetmyer never exceeds 470 — it's mathematically
  uncompetitive before any random contest even happens. **This is the real, practical risk of
  setting a must-have's budget target below the category's actual going rate: you don't get
  unlucky sometimes, you lose that player every time, in all 100 runs, with no exceptions.**
- **Tushar Deshpande: won 0/100, lost 13/100, unresolved 87/100.** A different failure mode from
  Hetmyer's: "unresolved" means nobody won him at all (he went unsold), not that a rival beat RR
  to him. A-Tier is a deep category — §2 counts 28 still-available A-Tier players — so plenty of
  A-Tier lots simply go unsold rather than contested, and Deshpande doesn't reliably happen to be
  one of the ones RR's own desperation fallback (§8) latches onto before the squad fills some
  other way.
- **Kyle Mayers (avoid): 0/100 won by RR, 100/100 avoided cleanly** — same guarantee as every
  avoid tag in A2, holds here too.

### A9. One real run, A-Tier lots only (same seed 42, Rajasthan Royals' perspective)

```
Blair Tickner        → Lucknow Super Giants      150  (contested)
Gulbadin Naib         → Kolkata Knight Riders     150  (contested)
Matthew Breetzke      → Mumbai Indians            150  (contested)
Nikhil Chaudhary      → Chennai Super Kings       125  (contested)
Duan Jansen           → Sunrisers Hyderabad       100  (contested)
Tushar Deshpande      → UNSOLD                                       ← RR's must-have, nobody won it
Marques Ackerman      → UNSOLD
Ottneil Baartman      → UNSOLD
Newman Nyamhuri       → UNSOLD
Kusal Mendis          → UNSOLD
Akash Deep            → UNSOLD
John Campbell         → UNSOLD
Maheesh Theekshana    → UNSOLD
Ibrahim Zadran        → UNSOLD
Nathan Smith          → UNSOLD
Zak Foulkes           → UNSOLD
Matthew Kuhnemann     → UNSOLD
Scott Boland          → UNSOLD
Charith Asalanka      → UNSOLD
Jaydev Unadkat        → UNSOLD
Mohammad Nabi         → UNSOLD
Sonal Dinusha         → UNSOLD
Chris Lynn            → UNSOLD
Tymal Mills           → UNSOLD
Dushmantha Chameera   → UNSOLD
Umesh Yadav           → UNSOLD
Matthew Fisher        → UNSOLD
Andre Fletcher        → UNSOLD
```

Only 5 of these 28 A-Tier players sold at all in this run, every one of them at or barely above
base price — a visibly thin, low-urgency category at this point in the auction. Deshpande,
RR's must-have, is simply one more name in a very long unsold list, which is exactly what
"unresolved" (rather than "lost") means in A8 above: this wasn't a bidding war RR lost, it was a
category nobody showed up for.

### A10. The right way to fix an underfunded must-have: find the real ceiling, then choose deliberately

A8 showed Hetmyer losing 100/100 times because RR's own Marquee target (470) capped its bid far
below competitive. Here's how to actually fix a situation like this — walked through on RR's
real saved strategy, using the same `upsertCategoryBudgetTarget` function the Set Budgets tab
itself calls.

**Step 1 — find your real ceiling before touching any strategy setting.** With RR's real 2625
remaining and 6 open slots, its actual legal max for a single bid right now — reserving
realistic money for the cheapest players still available to fill the other 5 — is **2250**
(computed directly from `computeMaxBid`, not estimated). Hetmyer's own real going rate is 3700.
2250 can never legally reach 3700: no budget target changes that, because a target only ever
restricts your *own* bid further, it never grants money you don't have. This ceiling tells you
what's actually achievable before you change a single number.

**Step 2 — never pin a must-have's target to today's live ceiling.** The real ceiling isn't
fixed for the rest of the auction — it climbs as the pool thins out and other teams fill their
own slots. A target pinned to one moment's snapshot (2250) reproduces the exact same failure as
the original 470, just at a higher number: Hetmyer still loses 100/100 times, because by the
time his lot actually comes up in most runs, the real affordability has already risen past
whatever frozen figure was written down.

**Step 3 — to protect one specific must-have's full real affordability, clear that category's
target instead of writing in a number.** With no target set, the must-have rule (§3) has
nothing to cap against and bids the real, live legal max directly — a ceiling that, by
construction, never exceeds what you can actually afford at that moment, and rises on its own
as the run goes on. This is the setting RR's real saved strategy now uses for Marquee, and it
gives Hetmyer a **66/100** win rate, always at a price RR can genuinely afford (average 2250),
with no number anywhere that's bigger than the purse.

**Step 4 — know what you're trading away, and choose it on purpose.** Clearing Marquee's target
does not also lift Tushar Deshpande's A-Tier win rate (it stays around 5/100), because the
waterfall (§4) only ever carries a leftover down from a category that *has* a target — an
untargeted category is never a source of a hand-down. That makes this a genuine either/or a
manager has to decide, not something the tool resolves for you:

- **To protect one specific, highest-priority must-have above everything else in its
  category** — clear that category's target, the way RR's Marquee is set now. That player gets
  the full real affordability, with nothing self-imposed holding it back.
- **To let a category's unused money help a *different*, lower-priority category's must-have
  through the waterfall instead** — keep a target on it on purpose, set well above what you
  expect to actually spend there. A target is only ever a self-imposed ceiling; your real purse
  is always the backstop underneath it regardless of the number written down. The cost is
  giving the must-have in that first category a slightly lower effective ceiling than going
  uncapped would.

Pick based on which player you'd be more upset to lose — there's no universally correct choice.
RR's real setup now takes the first option, protecting Hetmyer. A manager who'd rather protect
Deshpande's chances instead would make the opposite call, just as validly.

### A11. Comparing two real, named KKR strategies: shifting budget from Marquee to Elite

This is exactly the kind of comparison §11's save/load feature is for, and these are two
genuinely saved, named strategies on KKR's real team, not a hypothetical. Both keep the same
must-haves, avoids, rival estimates, and predictions as everywhere else in this appendix — the
only difference between them is where Marquee's budget target moved to:

| | "default" | "Elite Target" |
|---|---|---|
| Marquee target | 4500 | 3500 |
| Elite target | 650 | 1650 |

Same engine, same 100 runs, same fixed seed, loading each saved strategy in turn:

| | "default" | "Elite Target" |
|---|---|---|
| Trent Boult (must-have) | won 100/100, avg price **4500** | won **95/100**, avg price **3500** |
| Rahul Tripathi (must-have) | won 100/100, avg price 473 | won 100/100, avg price **1083** |
| Budget remaining (avg) | 132.75 | 85.75 |
| Completion (full squad) | **0/100** | **20/100** |

The headline result is a direct, easily-explained one: completion jumps from 0/100 to 20/100.
Freeing Elite up to a real 1650 target (instead of 650) lets KKR actually compete for Elite
picks it was previously capping itself out of — the same "don't set a target below the real
going rate" lesson as A8/A10, just applied to a category that isn't a must-have at all. The
trade-off is just as direct: lowering Marquee's own cap to 3500 means Boult now loses 5% of the
time (3500 isn't always enough), where he was unbeatable at 4500.

Tripathi's price rising from 473 to 1083 is a second, less obvious effect — B-Tier still has no
budget target of its own in either strategy, so his price has always floated with however much
of KKR's budget is left by the time his lot comes up (A4). Reshuffling how much Marquee and
Elite consume earlier in the same run changes that leftover in ways that aren't obvious just
from reading the two budget numbers side by side. That's the actual point of being able to save
and compare two real strategies instead of reasoning it out in advance: Simulate tells you what
actually happens, including the parts you wouldn't have predicted.
