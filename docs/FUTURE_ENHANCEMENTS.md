# LeagueForge — Future Enhancements

**Status:** living backlog, not a commitment or a roadmap with dates. Items get added when they
come up in conversation and are picked up whenever there's appetite to build them.

Each entry: what it is, why it'd be worth doing, and roughly how big a lift it looks like.

---

## Live broadcast / OBS-friendly view

A dedicated, stripped-down auction view designed to be captured as an OBS (or similar) browser
source for streaming an auction to YouTube/Twitch/Facebook Live — big On-the-clock card, no admin
controls, no login chrome, camera-and-stream-friendly layout. Several competitor cricket-auction
platforms already offer this as "broadcast overlay" mode.

The app already has real-time, no-video "watch along" via `/viewer/auctions/[id]/watch`
(Socket.IO-driven, updates live) — this would be a visual variant of that same page, not a new data
layer. Actual video encoding/streaming (OBS, RTMP, a YouTube/Twitch account) stays outside the app
entirely; this only builds the thing OBS points its browser source at.

**Rough size:** small-to-medium — mostly a new page/layout reusing existing `getAuctionState` data
and the On-the-clock template system, styled for legibility on a stream rather than a browser tab.

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

## Native mobile app (iOS / Android)

A real phone app — likely React Native/Expo to share logic with the existing TypeScript codebase,
rather than two fully separate native codebases — for managers bidding live and for viewers
watching, as an alternative to the mobile-responsive web app.

Main draws over the current mobile-web experience: push notifications (e.g. "you've been
outbid"), a home-screen icon/app-switcher presence during a long live auction, and generally
snappier perceived performance than a browser tab.

**Rough size:** large. The app today is Server Actions + React Server Components, not a
REST/GraphQL API a mobile client could call directly — this would need a real API layer built out
first (or a shared data layer the app exposes both ways), on top of the actual mobile client work
and app-store submission/review for both platforms.

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
- [ ] **Post-auction highlights/recap page** — a shareable summary once the auction ends (biggest
  buy, best-value pick, spend by category) — reuses data already being collected, good for social
  sharing/engagement.
- [ ] **Player comparison tool** — side-by-side stats for a manager's shortlisted players, for
  pre-auction planning or live in-the-moment decisions.
- [ ] **Multi-day auction scheduling** — pause/resume an auction across multiple sessions for larger
  tournaments (e.g. marquee players on day 1, the rest on day 2).

---

## Sponsor tiers

Every sponsor is treated identically today — `TournamentSponsor` (`prisma/schema.prisma`) has no
concept of rank, and `SponsorRibbon` gives each one the same fixed `h-28 w-28` logo size and an
equal share of the rotating "featured" spotlight, regardless of what that sponsor is actually
paying for the placement. A tiered model (e.g. Title / Gold / Silver, or just a numeric priority)
would let higher tiers get real, visible differentiation: a bigger logo, a larger slice of the
featured-rotation time, and placement first in the ribbon instead of the current per-session
shuffle. The one-time `SponsorSplash` modal shown on manager/viewer live pages could apply the
same ordering/sizing so a title sponsor isn't buried among equally-sized logos there either.

**Rough size:** small — a `tier` field (enum or int) on `TournamentSponsor` plus a migration, then
`SponsorRibbon`'s existing per-sponsor size/rotation-weight logic and `SponsorSplash`'s ordering
both read it instead of treating every sponsor the same. No new subsystem, no new page.

---

<!-- Add new items above this line, most recent first. -->
