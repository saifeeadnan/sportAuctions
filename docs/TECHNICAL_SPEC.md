# LeagueForge — Technical Specification & System Design

**Status:** living document, reflects the codebase as of 2026-07-30.
**Audience:** engineers working on this repo, and technical reviewers evaluating it.

## 1. Overview

LeagueForge is a multi-tenant sports-league management platform whose centerpiece is a
real-time, concurrent live auction: team managers place bids from their own devices against
server-enforced rules, rather than a single operator entering prices on their behalf. Around
that core it manages rosters, tournaments, teams, a pre-auction draft phase, post-auction
fantasy leagues, sponsor placements, and basic usage analytics — all scoped to independent
"leagues" (tenants) on one deployment.

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server Actions are the primary mutation path; a handful of REST routes handle file upload/download and Socket.IO's transport needs |
| Language | TypeScript, strict | |
| UI | React 19, Tailwind CSS 4 | |
| Database | PostgreSQL 16 | Local dev via `docker-compose.yml` |
| ORM | Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`) | Client generated into `app/generated/prisma` (not hand-edited) |
| Auth | NextAuth v5 (beta), Credentials provider, JWT sessions | No OAuth providers — username/password only |
| Real-time | Socket.IO 4, server-authoritative | Custom Node HTTP server (`server.ts`) wraps Next's request handler so Socket.IO can share the same port |
| File parsing | PapaParse (CSV) | Roster and points *import* accept CSV only — deliberately, since the `xlsx` (SheetJS) parser has unpatched prototype-pollution/ReDoS advisories with no npm fix; `xlsx` is still used one-way for *exporting* roster data, which doesn't parse untrusted input |
| Validation | Zod (present in deps; most mutation validation is hand-written in the service layer) | |

**Why a custom server:** Next.js's default `next start` has no place to attach a long-lived
Socket.IO server, so `server.ts` boots a raw `http.Server`, hands page/API requests to Next's
`handle()`, and attaches Socket.IO alongside it on the same port. This is also why `npm run
dev` and `npm run start` both run `tsx server.ts` instead of the framework's own scripts.

## 3. Architecture

```
Browser (manager / auctioneer / admin / viewer)
        │  Server Actions (mutations)      │  Socket.IO (auction:<id> room)
        ▼                                  ▲
┌───────────────────────────────────────────────────────┐
│  Next.js App Router (server.ts custom entrypoint)      │
│                                                         │
│  app/**/page.tsx        — server-rendered views         │
│  lib/actions/*.ts       — "use server" mutation entry    │
│  app/api/**/route.ts    — file upload/export, webhooks   │
│  lib/services/*.ts      — domain logic, one file/domain  │
│  lib/auth/{guards,scope}.ts — role + league-tenancy checks│
│  server/ws/broadcaster.ts   — emits to Socket.IO rooms   │
└───────────────────────────────────────────────────────┘
        │
        ▼
   PostgreSQL (Prisma Client, pg adapter)
```

**Layering convention** (consistent across every domain — auction, roster, tournament,
fantasy, league, self-registration):

1. **`lib/actions/*.ts`** — `"use server"` functions called directly from client/server
   components or forms. Responsible only for: authenticating (`requireRole`), resolving
   tenant scope, loading the target resource through a scope-checked loader, delegating to a
   service function, and calling `revalidatePath`.
2. **`lib/services/*.ts`** — pure domain logic against Prisma. All business-rule validation
   (budget math, state-machine transitions, squad caps) lives here, independent of who's
   calling it or how the request arrived. Services throw typed `DomainError` subclasses
   (§6) rather than generic `Error`.
3. **`app/api/**/route.ts`** — REST routes exist only where Server Actions don't fit: binary
   file upload/download (rosters, sponsor images, rules PDFs), CSV/XLSX export, and the
   analytics heartbeat beacon.

## 4. Data model

Prisma schema: `prisma/schema.prisma`. cuid primary keys throughout; money fields are
`Decimal`, never `Float`.

### 4.1 Tenancy & identity

- **`League`** — the tenant boundary. Has a free-text `type` (not an enum — a league isn't
  hardcoded to one sport).
- **`User`** — one row per human account. `role` is one of `ADMIN | LEAGUE_ADMIN |
  TEAM_MANAGER | AUCTIONEER | VIEWER`. Every non-`ADMIN` user carries a `leagueId`; `ADMIN` is
  the only role that spans leagues. `loginId` (not email) is the sign-in identifier and is
  also how a `User` account is matched back to a `Player` roster row for self-registration,
  "you're always drafted onto your own team," and fantasy-team eligibility. `isActive`
  gates login independent of password correctness (§5).

### 4.2 Rosters & tournaments

- **`PlayerRoster`** → **`Player`** (1:N) — a reusable pool of players, scoped to a league.
  Imported in bulk via CSV/XLSX (`lib/services/roster.service.ts`) or entered one at a time.
- **`Tournament`** — belongs to a `PlayerRoster` (and inherits that roster's `leagueId`
  directly, so a tournament can never disagree with its own roster about tenancy),
  `numTeams`, `squadSize`, a date range, and a `TournamentStatus` (`DRAFT | ACTIVE |
  COMPLETED`).
- **`Team`** — belongs to a `Tournament`, optionally has a `managerId` (a `TEAM_MANAGER`
  `User`). `managerOccupiesSlot` controls whether the manager consumes one of the team's
  squad slots (see §5.3).
- **`TournamentDocument`**, **`TournamentSponsor`**, **`TeamSponsorImage`** — binary blobs
  (`Bytes` columns) for rules PDFs and sponsor logos, stored in Postgres directly rather than
  an object store.

### 4.3 Auctions

- **`Auction`** — belongs to a `Tournament`. `auctionType` is `LIVE | SILENT | FIXED_PRICE`
  but only `LIVE` has an implemented flow (`lib/auctionTypes.ts` rejects the other two at
  creation time — they're reserved, not functional). `status` is a strict state machine:
  `CREATED → PRE_AUCTION_OPEN → PRE_AUCTION_LOCKED → BIDDING → COMPLETED` (§5.2).
- **`AuctionCategory`** — a pricing tier within an auction (e.g. "Marquee", "Grade A"), each
  with its own `basePrice` and optional `bidIncrement`. `preAuctionEligible` controls whether
  players in that category can be pre-drafted or must go to live bidding.
- **`AuctionPlayer`** — the join between a `Player` and an `Auction`, and the row that
  actually carries auction-time state: `status` (`AVAILABLE | IN_PRE_AUCTION_POOL |
  IN_BIDDING | SOLD | UNSOLD`), `soldVia` (`PRE_AUCTION_DRAFT | LIVE_BID | ADMIN_ASSIGNED`),
  and — only while `IN_BIDDING` — `currentBidAmount`, `currentBidderEntryId`,
  `bidCooldownUntil`. This is the single row a live bid's optimistic-concurrency check reads
  and writes (§5.4).
- **`Bid`** — an immutable, append-only history row per bid attempt that succeeds. Never
  mutated or deleted, including by the "reset a live round" flow (§5.2) — only the derived
  state on `AuctionPlayer` gets rolled back.
- **`TeamAuctionEntry`** — a `Team`'s participation record for one specific `Auction`:
  `budgetRemaining`, `slotsFilled`/`slotsTotal`, and its own status lifecycle (`CREATED →
  PRE_AUCTION_DRAFTING → PRE_AUCTION_SUBMITTED → ALLOCATED_PRE_AUCTION → AUCTION_LIVE →
  FINAL`). This is the row every budget/slot check in the bidding service reads.
- **`PreAuctionSubmission`** — a team's draft picks before bidding opens; many-to-many
  between `TeamAuctionEntry` and `AuctionPlayer`, resolved by `overlapResolution.service.ts`.

### 4.4 Fantasy & analytics

- **`FantasyTeam`** / **`FantasyTeamPlayer`** — one fantasy team per `(auctionId, userId)`,
  built from real post-auction sold prices (or category base price if unsold). Editable until
  the parent tournament's `startDate`.
- **`LoginEvent`**, **`AnalyticsSession`**, **`SponsorClickEvent`** — append-only logs behind
  the admin analytics dashboard: login history, session duration (via a client heartbeat
  beacon), and sponsor-logo click tracking.

## 5. Core domain flows

### 5.1 Multi-tenancy enforcement

Every mutating action starts with two checks, both in `lib/auth/guards.ts` and
`lib/auth/scope.ts`:

1. **Role check** — `requireRole(...)` / `requireAdminOrLeagueAdmin()` throws unless the
   session's role is in the allowed set.
2. **Scope check** — `scopeLeagueId(session)` returns `null` for `ADMIN` (unrestricted) or
   the caller's own `leagueId` otherwise; `assertInScope` then compares that against the
   target resource's actual league (resolved by walking the resource's own relations, e.g.
   `loadScopedAuction` joins through `auction → tournament → leagueId`). A `LEAGUE_ADMIN`
   cannot act on another league's data even by guessing an ID.

`resolveAdminScope` is explicitly documented as a **display-only** filter for the admin
league switcher and must not be used as the authorization check for a mutation — that
distinction is called out in the source itself because the two are easy to conflate.

### 5.2 Auction state machine

```
CREATED ──openPreAuction──► PRE_AUCTION_OPEN ──lockPreAuction──► PRE_AUCTION_LOCKED
                                                                        │
                                                                  startBidding
                                                                        ▼
                                                                    BIDDING
                                                                   │      │
                                                    resetAuctionToPreBidding  concludeAuction
                                                                   ▼      ▼
                                                     PRE_AUCTION_LOCKED  COMPLETED
```

- **`openPreAuction`** snapshots every team into a `TeamAuctionEntry`, deducting the
  manager's slot price up front only if that manager isn't matched to their own player in the
  pool (§5.3), and rejects if a manager's price alone would exceed the auction's team budget.
- **`lockPreAuction`** requires every team to have submitted its draft (or `force: true` to
  override), then locks the auction and immediately runs `resolveOverlaps`.
- **`startBidding`** flips every entry to `AUCTION_LIVE` and stamps `startedAt`.
- **`resetAuctionToPreBidding`** is the "undo the live round" safety valve: it walks every
  `AuctionPlayer`, reverses anything sold via `LIVE_BID` (refunding budget/slots to the
  winning `TeamAuctionEntry`), restores any player left `IN_BIDDING`/`UNSOLD` to its
  pre-bidding status, and moves the auction back to `PRE_AUCTION_LOCKED`. Pre-auction-draft
  and admin-assigned allocations are untouched, since those happened before bidding started.
  The `Bid` history rows are never deleted. The resulting fresh state is broadcast as
  `auction:reset` so every connected client resyncs in one shot rather than replaying
  individual events.
- **`concludeAuction`** marks every still-open `AuctionPlayer` `UNSOLD` and every
  `TeamAuctionEntry` `FINAL`.

### 5.3 Pre-auction draft & overlap resolution

Before live bidding, managers privately submit a wishlist (`submitDraft`, capped at their
team's remaining slots and total base-price budget). A manager's own player (matched by
`loginId`) is always force-included in their draft and can never be removed — mirrored later
in fantasy-team submission, where a viewer is always on their own fantasy team.

`resolveOverlaps` (run once, at lock time) partitions every `AVAILABLE` auction player by how
many teams drafted them:
- **0 teams** → stays `AVAILABLE` (goes to live bidding).
- **Exactly 1 team**, and that team can afford it and has a slot → auto-sold at base price,
  `soldVia: PRE_AUCTION_DRAFT`.
- **2+ teams**, or the sole team can't actually afford/fit it → `IN_PRE_AUCTION_POOL`, which
  live bidding treats the same as any other available player.

This is a deliberate design choice over a coin-flip or first-come priority: a genuine bidding
war is resolved by bidding, not by whichever team happened to submit first.

### 5.4 Live bidding — the concurrency-safe core

`placeBid` (`lib/services/bidding.service.ts`) is the highest-stakes function in the
codebase — the one place where two requests can legitimately race for the same resource. Its
rules, all server-enforced (never trusted from the client):

1. Player must currently be `IN_BIDDING`.
2. Bidder's team must have a free squad slot.
3. **A team cannot re-raise its own standing bid** — `entry.id === auctionPlayer
   .currentBidderEntryId` is rejected outright.
4. **Cooldown**: if `bidCooldownUntil` (now + 10s from the last accepted bid) hasn't passed,
   the bid is rejected — paces the room and gives the next bidder a fair window.
5. **Minimum amount**: base price if no standing bid; otherwise `currentBid +
   category.bidIncrement` if the category defines one, else simply "strictly greater than."
   (Increment is optional per-category — see §7 limitations.)
6. **Affordability**: the bid can't exceed what the team could afford while still reserving
   enough to fill every remaining slot at the cheapest category's base price
   (`computeReserveUnit` — the same reserve math `allocatePlayerToTeam` uses for a final
   sale). A bid never actually debits budget; only a completed sale does.

**Concurrency safety**: the accept path is an optimistic compare-and-swap —
`auctionPlayer.updateMany({ where: { id, status: "IN_BIDDING", currentBidAmount: <the
value this request read> }, data: {...} })` inside a transaction. If another request already
moved `currentBidAmount` between this request's read and write, `count` comes back `0`, the
whole transaction (including the `Bid` history insert) rolls back, and the loser gets "someone
else just bid — refresh and try again." This closes the race window without row-level locking
or a queue: two simultaneous bids on the same player can never both "win."

A successful bid emits `bid:placed` over the auction's Socket.IO room; a completed sale emits
`player:sold` and `team:budget-updated`; putting the next player up emits `player:on-clock`.
The auctioneer can also bid on a manager's behalf (`adminPlaceBidAction`) — same `placeBid`
call, same rules, only the authorization differs — for a manager without a working device.

### 5.5 Real-time transport

`server.ts` attaches a Socket.IO server to the same HTTP server as Next. On `join`, the server
decodes the caller's session JWT from the handshake cookie (`next-auth/jwt`'s `getToken`) and
checks the same role/league scope as every other read path (`ADMIN`, or the auction's
tournament `leagueId` matching the caller's) before adding the socket to that auction's room
(`auction:<id>`) — a bare `auctionId` alone isn't enough to listen in. Every domain mutation
that changes shared auction state calls `emitAuctionEvent(auctionId, event, payload)`
(`server/ws/broadcaster.ts`), which is a thin wrapper around
`io.to(room).emit(...)`. The client hook (`hooks/useAuctionSocket.ts`) applies each event as
a local, incremental patch to an initially server-rendered `AuctionState` — except
`auction:reset`, which replaces the whole state wholesale, since a reset can invalidate
several players/teams at once and per-event patching would be error-prone to keep in sync.

Because the socket layer is purely a state-propagation channel — every mutation is validated
and persisted through the same service functions regardless of transport — a client that
missed an event (dropped connection, tab backgrounded) is only ever stale until its next
`getAuctionState` fetch, never inconsistent with the database.

### 5.6 Fantasy leagues

Built entirely from real auction outcomes, not synthetic data: a pick's price is what it
actually sold for (or its category's base price, if it went unsold). A viewer is only
eligible for a given auction's fantasy game if they were themselves in that auction's player
pool (matched by `loginId`), and is always auto-included on their own fantasy team the same
way a manager is on their own draft. Editing is unlocked until the parent tournament's
`startDate` (`isFantasyEditingLocked`) and freezes automatically at that point — no explicit
lock action or scheduled job required. Standings rank by uploaded `points` once an admin has
uploaded any (`AuctionPlayer.points`), falling back to a computed `teamStrength` (position
balance × average skill rating, `lib/teamStrength.ts`) beforehand.

### 5.7 Self-service registration

`registerSelf` (`lib/services/selfRegistration.service.ts`) lets a player create their own
account from a league-scoped invite link: `loginId` must match an existing `Player` row in
that league's rosters (so registration can't manufacture accounts unrelated to any real
player), and the resulting `User` is always `role: VIEWER` and always `isActive: false` until
a League Admin approves it — registration alone never grants standing access.

### 5.8 Sponsors & analytics

Sponsor logos attach at both the tournament and team level (`TournamentSponsor`,
`TeamSponsorImage`), stored as blobs and served through dedicated routes. Every logo click
records a `SponsorClickEvent`; the admin analytics dashboard aggregates login history,
per-user session duration (via a periodic client heartbeat, `AnalyticsHeartbeat.tsx` →
`/api/analytics/heartbeat`), and sponsor clicks — all paginated server-side
(`analytics.service.ts`), not computed client-side.

## 6. Error handling

`lib/errors.ts` defines a small `DomainError` hierarchy — `ValidationError`,
`InsufficientBudgetError`, `SquadCapExceededError`, `InvalidStateTransitionError` — all
thrown from the service layer with a human-readable message and no internal detail leakage.
`lib/api/errors.ts`'s `toErrorResponse` maps these to REST responses for the `app/api` routes;
Server Actions let them propagate as thrown `Error`s, which client components catch and
render (`err.message`) directly, e.g. `BidControl.tsx`'s try/catch around
`placeBidAction`.

## 7. Known limitations (honest as of this writing)

These are real gaps, not hedging — worth knowing before relying on this system for something
they'd affect:

- **Only `LIVE` auctions are implemented.** `SILENT` and `FIXED_PRICE` exist as schema/type
  values and are explicitly rejected at auction-creation time (`lib/auctionTypes.ts`).
- **Bid increment is optional, not mandatory**, per category. A category with no
  `bidIncrement` only enforces "strictly higher than the current bid," which admits
  arbitrarily small raises.
- **No automated test suite exists in this repo** (no `*.test.*` files found at the time of
  writing) — correctness currently rests on the service-layer validation and manual QA, not
  CI-enforced regression coverage.
- **No application-level rate limiting** on self-service registration or login — abuse
  protection, if any, would need to sit in front of the app (reverse proxy / WAF), not in the
  code itself.
- **Binary assets (sponsor images, rosters' photo URLs' actual files, rules PDFs) are stored
  as `Bytes` columns in Postgres**, not an object store (S3-equivalent) — fine at current
  scale, worth revisiting if upload volume/size grows materially.
- **Single Postgres instance, no read replica or caching layer** — every `getAuctionState`
  call and every socket-triggered UI patch reads from the same primary the writes hit.
- **Real-time delivery is at-most-once and non-persistent** — Socket.IO has no message replay;
  a client that's disconnected when an event fires only catches up on its next full-state
  fetch (§5.5), which is by design but worth knowing if a stronger delivery guarantee is ever
  assumed.

## 8. Local development

```bash
npm install
npm run db:up        # docker compose up -d — Postgres 16 on :5432
npx prisma migrate dev
npm run dev           # tsx server.ts — Next.js + Socket.IO on :3000
```

`npm run dev:tunnel` runs `scripts/dev-tunnel.ps1` to expose the local dev server for testing
from another device (e.g. a phone acting as a team manager) on the same live-bidding flow.
`npm run db:backup` / `db:restore` wrap `scripts/backup-database.ts` / `restore-database.ts`
for local Postgres snapshots.
