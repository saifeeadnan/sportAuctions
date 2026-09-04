# LeagueForge — Future Enhancements

**Status:** living backlog, not a commitment or a roadmap with dates. Items get added when they
come up in conversation and are picked up whenever there's appetite to build them.

Each entry: what it is, why it'd be worth doing, and roughly how big a lift it looks like.

---

## Live broadcast / OBS-friendly view — Done 2026-08-21

~~A dedicated, stripped-down auction view designed to be captured as an OBS (or similar) browser
source for streaming an auction to YouTube/Twitch/Facebook Live.~~ **Done 2026-08-21.** New route
`/auctioneer/auctions/[id]/broadcast`, reusing the auctioneer's own login (no new public/token
auth surface) and the existing real-time data layer (`getAuctionState`/`useAuctionSocket`) — a
visual variant, not a new data layer, exactly as scoped. Shows the on-clock player in the auction's
own configured on-clock template (Classic/Photo-focus/Stats table), the live current bid, an
oversized countdown, and sponsors, with the app's nav chrome hidden (`NavVisibility`) and no admin
controls. Team rosters (`SoldTicker`) appear automatically only during idle moments — before the
next player is selected, or once the auction completes — so they never compete with the live card
for space, with no operator interaction needed.

---

## Auction Analytics v2 — Mode 2 (standalone / manual-entry sessions)

Mode 1 of the v2 Analytics dashboard (value-over-replacement scoring, wishlist feasibility, rival
category-budget estimates, roster affordability) is fully built and only works for auctions run
through this app, since it reads live off this app's own `Auction`/`AuctionPlayer`/
`TeamAuctionEntry` data via `lib/auction/analyticsAdapter.ts`.

Mode 2 was the original plan's second half, deferred: the same analytics for someone running an
auction on a *different* platform (or no software at all — replacing a hand-built spreadsheet).
It needs its own minimal system of record, since there's no other app generating the data
electronically:
- CSV upload for setup-time data (teams, categories, player pool) — reusing the same
  PapaParse/`HEADER_ALIASES` pattern already established in `lib/services/roster.service.ts`.
- A manual "record a sale" entry form (player + team dropdowns, price — never free-typed) as the
  live event feed, replacing the spreadsheet's hand-typed, typo-prone cells.
- New, deliberately separate Prisma models (`StandaloneAuctionSession`/`StandaloneTeam`/
  `StandaloneCategory`/`StandalonePlayer`/`StandaloneSaleEvent`), single-user-owned — no
  multi-user auth/sharing model needed, matching how the original Excel was actually used.
- A second adapter (`lib/auction-analytics/standaloneAdapter.ts`) mapping these models into the
  exact same generic types Mode 1's adapter already produces, so the computation core (value
  scores, wishlist feasibility, rival estimates) doesn't know or care which mode fed it.

**Rough size:** medium-to-large — new schema + migration, a small CSV-import service mirroring an
existing pattern, a manual-entry UI, and a new route tree (`app/standalone-analytics/`), but zero
changes needed to the analytics computation core itself, which was built decoupled specifically so
this could plug into it later.

---

## Native mobile app (iOS / Android) — Done 2026-08-31

~~A real phone app... for managers bidding live and for viewers watching, as an alternative to the
mobile-responsive web app.~~ **Done 2026-08-31.** Shipped in two phases: Phase 0 (2026-08-21) added
a server-side bearer-token auth layer alongside the existing cookie sessions
(`app/api/mobile/**`) — the "real API layer" this used to say was a prerequisite. Phase 1
(2026-08-31, `02e025f`) is the actual Expo (SDK 54) client: auth, live bidding, and fantasy teams,
scoped to VIEWER/TEAM_MANAGER, redesigned to mirror the web app. Home-screen presence and snappier
perceived performance are both realized. The one draw from the original pitch still open is push
notifications (e.g. "you've been outbid") — tracked as its own item below, since it's additive to
an app that already exists rather than a prerequisite for one.

---

## Auction enhancements

A batch of ideas gathered from competitor cricket/IPL-style auction platforms. Grouped together
since they're all auction-mechanic tweaks rather than new subsystems — each is independently small
enough to build on its own.

- [ ] **Retention + Right-to-Match (RTM) cards** — the single most iconic missing IPL-style
  mechanic. Teams pre-retain a player before the auction, or hold a card letting them match the
  winning bid on a player they previously owned rather than losing them outright. Would extend the
  existing pre-auction draft flow (`openPreAuction`/`preAuctionDraft.service.ts`) rather than
  replace it.
- [x] **Unsold-player re-auction at a reduced base price** — ~~instead of a player just sitting
  "unsold," automatically re-offer them in a later round at a lower price.~~ **Done 2026-08-20.**
  An opt-in switch plus discount percentage, set once at auction creation in the wizard; an unsold
  player's price is discounted on its first re-offer only and never drops further on subsequent
  unsold passes.
- [x] **Live countdown/bidding timer** — ~~a visible "going once, going twice" clock that resets
  on each new bid, creating real urgency for the room.~~ **Done 2026-08-20.** Visual-only —
  resets on every bid, never auto-resolves the sale — configurable per auction (on/off + seconds)
  in the creation wizard. Distinct from the existing `AuctionPlayer.bidCooldownUntil` (that's
  anti-spam, not a public clock).
- [ ] **Real-time "you've been outbid" push notifications** — a lighter-weight version of the native
  mobile app idea above; deliverable via browser web push alone, no app store needed.
- [x] **Post-auction highlights/recap page** — ~~a shareable summary once the auction ends (biggest
  buy, best-value pick, spend by category)~~. **Done 2026-08-21, most recently polished
  2026-09-03.** Public token-based share link (`app/highlights/[token]/page.tsx`) showing sold/
  unsold counts, biggest buy per category, team captains, the best-value pick, sponsor placements,
  and a spend-by-category chart (redesigned 2026-09-03 to show average price per player as a
  dot/lollipop plot rather than total spend, per the dataviz skill's one-axis rule).
- [ ] **Player comparison tool** — side-by-side stats for a manager's shortlisted players, for
  pre-auction planning or live in-the-moment decisions.
- [ ] **Multi-day auction scheduling** — pause/resume an auction across multiple sessions for larger
  tournaments (e.g. marquee players on day 1, the rest on day 2).

---

## Sponsor tiers — Done 2026-08-21

~~Every sponsor is treated identically today...~~ **Done 2026-08-21.** Sponsors now have a
predefined `SponsorTier` (`TITLE` / `MARQUEE` / `COMMUNITY`), set at add-time in the admin sponsor
form. `SponsorRibbon` gives higher tiers a larger logo, a bigger share of the rotating "featured"
spotlight (weighted 3x/2x/1x), and always leads with Title before Marquee before Community.
`SponsorSplash`'s one-time modal sizes logos the same way. The admin sponsor grid shows a tier
badge per sponsor. Every sponsor that existed before this shipped was backfilled to `MARQUEE` as a
one-time goodwill bump; new sponsors default to `COMMUNITY`.

---

## Multi-factor authentication + email/text sending capability

Two related pieces: (1) a general-purpose ability for the app to actually send email and SMS
messages, which doesn't exist today at all, and (2) multi-factor authentication on login, built on
top of that — a one-time code sent to email or phone as a second factor beyond today's single
loginId+password `Credentials` check.

**Why:** Login is currently one leaked/guessed password away from full account takeover, which
matters most for Admin/League-Admin accounts (they control team budgets, corrections, and league
settings). The messaging capability itself is also independently useful beyond MFA — password
reset via email, and a channel for the "you've been outbid" notification idea already in the
Auction enhancements list above (SMS/email as an alternative or companion to a native push
notification).

**Rough size:** medium-to-large, in two separable pieces. `User.email`/`User.phone` already exist
as optional, unique fields on the model (`prisma/schema.prisma`) — collected but never actually
used to send anything today — so the destination data is already there. What's missing: a
third-party provider integration for actually sending (email: e.g. Resend/SendGrid/SES; SMS:
Twilio or similar — new external dependency + API credentials), and, for MFA specifically, new
enrollment/challenge state (an MFA-enabled flag, a pending-challenge record, backup codes) plus a
second step inserted into the login flow after password check — not a drop-in NextAuth
`Credentials` provider option, since MFA isn't a first-class concept there, so this needs a custom
challenge screen/flow in `auth.ts`/`auth.config.ts`. The messaging capability could ship on its own
first (unlocking password reset + notifications) with MFA following once it exists.

---

<!-- Add new items above this line, most recent first. -->
