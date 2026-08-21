import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { isLeagueReadOnly } from "@/lib/services/league.service";
import { openPreAuctionAction, startBiddingAction, startBiddingDirectAction } from "@/lib/actions/auction.actions";
import { ActionResultForm } from "@/components/ui/ActionResultForm";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { AssignPlayerForm } from "@/components/admin/AssignPlayerForm";
import { AddPlayerToAuctionForm } from "@/components/admin/AddPlayerToAuctionForm";
import { ChangePlayerCategoryForm } from "@/components/admin/ChangePlayerCategoryForm";
import { EditCategoryBidIncrementForm } from "@/components/admin/EditCategoryBidIncrementForm";
import { EditAuctionBudgetForm } from "@/components/admin/EditAuctionBudgetForm";
import { EditAuctionSquadSizeForm } from "@/components/admin/EditAuctionSquadSizeForm";
import { EditOnClockDisplayForm } from "@/components/admin/EditOnClockDisplayForm";
import type { OnClockFieldKey } from "@/lib/onClockDisplay";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";
import { card, cardInteractive, buttonPrimary, buttonSecondary } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import { AUCTION_TYPE_LABELS } from "@/lib/auctionTypes";

const ENTRY_STATUS_VARIANT: Record<string, "neutral" | "info" | "success" | "warning"> = {
  AUCTION_LIVE: "info",
  FINAL: "success",
  ALLOCATED_PRE_AUCTION: "warning",
};

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { leagueIds } = await requireAdminOrLeagueAdmin();

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      tournament: true,
      categories: true,
      entries: { include: { team: true }, orderBy: { team: { name: "asc" } } },
      auctionPlayers: { include: { player: true, category: true } },
    },
  });
  if (!auction) notFound();
  assertInScope(leagueIds, auction.tournament.leagueId);

  const [sponsors, league] = await Promise.all([
    listTournamentSponsors(auction.tournamentId),
    prisma.league.findUniqueOrThrow({
      where: { id: auction.tournament.leagueId },
      select: { endDate: true },
    }),
  ]);
  const readOnly = isLeagueReadOnly(league);

  // Roster players not yet represented as an AuctionPlayer row — e.g. added
  // to the roster after this auction was created, so createAuction's
  // one-time playerAssignments snapshot never picked them up.
  const rosterPlayers = auction.tournament.rosterId
    ? await prisma.player.findMany({
        where: { rosterId: auction.tournament.rosterId },
        orderBy: { name: "asc" },
      })
    : [];
  const playerIdsInAuction = new Set(auction.auctionPlayers.map((ap) => ap.playerId));
  const unassignedRosterPlayers = rosterPlayers.filter((p) => !playerIdsInAuction.has(p.id));

  const statusCounts = auction.auctionPlayers.reduce<Record<string, number>>((acc, ap) => {
    acc[ap.status] = (acc[ap.status] ?? 0) + 1;
    return acc;
  }, {});

  const playerCountByCategory = auction.auctionPlayers.reduce<Record<string, number>>(
    (acc, ap) => {
      acc[ap.categoryId] = (acc[ap.categoryId] ?? 0) + 1;
      return acc;
    },
    {}
  );

  // Bid increments are only locked while someone is actually on the
  // clock — not for the whole "BIDDING" auction status, which spans the
  // entire live session including every gap between players.
  const playerOnClock = auction.auctionPlayers.some((ap) => ap.status === "IN_BIDDING");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">{auction.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {auction.tournament.name} &middot; {AUCTION_TYPE_LABELS[auction.auctionType]} &middot;
          status: {auction.status} &middot; team budget: {String(auction.teamBudget)}
        </p>
        <p className="text-sm text-black/60 dark:text-white/60">
          Player pool ({auction.auctionPlayers.length}):{" "}
          {Object.entries(statusCounts)
            .map(([status, count]) => `${count} ${status}`)
            .join(" · ")}
        </p>
      </div>

      <details className={card}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Categories &amp; base prices ({auction.categories.length})
        </summary>
        <div className="px-4 pb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Base price</th>
                <th className="py-2 pr-4">Players</th>
                <th className="py-2 pr-4">Pre-auction draft</th>
                <th className="py-2 pr-4">Bid increment</th>
              </tr>
            </thead>
            <tbody>
              {auction.categories.map((c) => (
                <tr key={c.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{c.name}</td>
                  <td className="py-2 pr-4">{String(c.basePrice)}</td>
                  <td className="py-2 pr-4">{playerCountByCategory[c.id] ?? 0}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={c.preAuctionEligible ? "success" : "neutral"}>
                      {c.preAuctionEligible ? "Allowed" : "Live bidding only"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    {c.bidIncrement != null ? `+${String(c.bidIncrement)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section>
        <h2 className="text-lg font-medium mb-3">Teams</h2>
        {auction.entries.length === 0 ? (
          <p className="text-black/60 dark:text-white/60">
            Pre-auction has not been opened yet.
          </p>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pl-4 pr-4">Team</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Budget remaining</th>
                  <th className="py-2 pr-4">Slots</th>
                </tr>
              </thead>
              <tbody>
                {auction.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-2 pl-4 pr-4">
                      <Link
                        href={`/admin/auctions/${auction.id}/teams/${entry.id}`}
                        className="underline underline-offset-2"
                      >
                        {entry.team.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={ENTRY_STATUS_VARIANT[entry.status] ?? "neutral"}>
                        {entry.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">{String(entry.budgetRemaining)}</td>
                    <td className="py-2 pr-4">
                      {entry.slotsFilled}/{entry.slotsTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {auction.status !== "COMPLETED" && readOnly && (
        <section>
          <h2 className="text-lg font-medium mb-3">Settings</h2>
          <div className={`${card} px-4 py-3 text-sm text-black/40 dark:text-white/40`}>
            This league is read-only — auction settings can no longer be changed.
          </div>
        </section>
      )}

      {auction.status !== "COMPLETED" && !readOnly && (
        <section>
          <h2 className="text-lg font-medium mb-3">Settings</h2>
          <div className={`${card} divide-y divide-black/5 dark:divide-white/5`}>
            <details>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                On-the-clock display
              </summary>
              <div className="px-4 pb-4">
                <p className="text-sm text-black/60 dark:text-white/60 mb-3">
                  How the player currently up for bid is shown during live bidding — the
                  auctioneer console, manager live view, and viewer watch page all use this.
                  Changes take effect the next time each viewer refreshes.
                </p>
                <EditOnClockDisplayForm
                  auctionId={auction.id}
                  initialTemplate={auction.onClockTemplate}
                  initialVisibleFields={auction.onClockVisibleFields as OnClockFieldKey[]}
                />
              </div>
            </details>

            {auction.entries.length > 0 && (
              <details>
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                  Edit team budget
                </summary>
                <div className="px-4 pb-4">
                  <p className="text-sm text-black/60 dark:text-white/60 mb-3">
                    Shifts every team&apos;s remaining budget by the same amount immediately,
                    even mid-bidding — money already spent is preserved. Rejected entirely if it
                    would put any team into deficit.
                  </p>
                  <EditAuctionBudgetForm auctionId={auction.id} teamBudget={String(auction.teamBudget)} />
                </div>
              </details>
            )}

            {auction.entries.length > 0 && (
              <details>
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                  Edit squad size
                </summary>
                <div className="px-4 pb-4">
                  <p className="text-sm text-black/60 dark:text-white/60 mb-3">
                    Sets every team&apos;s slot cap to this exact number immediately, even
                    mid-bidding. Rejected entirely if any team already has more players than
                    this.
                  </p>
                  <EditAuctionSquadSizeForm auctionId={auction.id} squadSize={auction.entries[0].slotsTotal} />
                </div>
              </details>
            )}

            {auction.entries.length > 0 && (
              <details>
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                  Assign player directly
                </summary>
                <div className="px-4 pb-4">
                  <p className="text-sm text-black/60 dark:text-white/60 mb-3">
                    Assigns a player straight to a team as sold, bypassing the pre-auction draft
                    and live auction entirely.
                  </p>
                  <AssignPlayerForm
                    auctionId={auction.id}
                    players={auction.auctionPlayers
                      .filter((ap) => ap.status === "AVAILABLE")
                      .map((ap) => ({
                        id: ap.id,
                        name: ap.player.name,
                        categoryName: ap.category.name,
                        basePrice: String(ap.category.basePrice),
                      }))}
                    teams={auction.entries.map((entry) => ({
                      id: entry.id,
                      teamName: entry.team.name,
                      budgetRemaining: String(entry.budgetRemaining),
                      slotsFilled: entry.slotsFilled,
                      slotsTotal: entry.slotsTotal,
                    }))}
                  />
                </div>
              </details>
            )}

            <details>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                Add player from roster ({unassignedRosterPlayers.length} not yet in this auction)
              </summary>
              <div className="px-4 pb-4">
                <p className="text-sm text-black/60 dark:text-white/60 mb-3">
                  For a player added to the roster (or missed) after this auction was created —
                  joins the pool as Available, same as every player chosen when the auction
                  started.
                </p>
                <AddPlayerToAuctionForm
                  auctionId={auction.id}
                  players={unassignedRosterPlayers.map((p) => ({ id: p.id, name: p.name }))}
                  categories={auction.categories.map((c) => ({
                    id: c.id,
                    name: c.name,
                    basePrice: String(c.basePrice),
                  }))}
                />
              </div>
            </details>

            <details>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                Change player category
              </summary>
              <div className="px-4 pb-4">
                <p className="text-sm text-black/60 dark:text-white/60 mb-3">
                  Moves a player to a different category of this auction — e.g. if the
                  roster&apos;s own category for them was corrected after this auction started.
                  Only available before a player is sold or on the clock.
                </p>
                <ChangePlayerCategoryForm
                  auctionId={auction.id}
                  players={auction.auctionPlayers
                    .filter((ap) => ap.status !== "SOLD" && ap.status !== "IN_BIDDING")
                    .map((ap) => ({
                      id: ap.id,
                      name: ap.player.name,
                      categoryName: ap.category.name,
                    }))}
                  categories={auction.categories.map((c) => ({
                    id: c.id,
                    name: c.name,
                    basePrice: String(c.basePrice),
                  }))}
                />
              </div>
            </details>

            <details>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                Bid increments
              </summary>
              <div className="px-4 pb-4">
                <p className="text-sm text-black/60 dark:text-white/60 mb-3">
                  How much each new bid must beat the current one by, per category. Locked only
                  while a player is on the clock — editable any other time, including between
                  players during live bidding.
                </p>
                <ul className="flex flex-col gap-2">
                  {auction.categories.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>{c.name}</span>
                      {playerOnClock ? (
                        <span className="text-black/60 dark:text-white/60">
                          {c.bidIncrement != null ? `+${String(c.bidIncrement)}` : "—"}
                        </span>
                      ) : (
                        <EditCategoryBidIncrementForm
                          auctionId={auction.id}
                          categoryId={c.id}
                          bidIncrement={c.bidIncrement != null ? String(c.bidIncrement) : null}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        </section>
      )}

      <section className="flex gap-3">
        {auction.status === "CREATED" && !auction.skipPreAuctionDraft && (
          <ActionResultForm action={openPreAuctionAction.bind(null, auction.id)}>
            <button type="submit" className={buttonPrimary}>
              Open pre-auction
            </button>
          </ActionResultForm>
        )}

        {auction.status === "CREATED" && auction.skipPreAuctionDraft && (
          <ActionResultForm action={startBiddingDirectAction.bind(null, auction.id)}>
            <button type="submit" className={buttonPrimary}>
              Start bidding (pre-auction draft skipped)
            </button>
          </ActionResultForm>
        )}

        {auction.status === "PRE_AUCTION_OPEN" && (
          <Link href={`/admin/auctions/${auction.id}/lock-review`} className={buttonPrimary}>
            Lock &amp; resolve overlaps
          </Link>
        )}

        {auction.status === "PRE_AUCTION_LOCKED" && (
          <ActionResultForm action={startBiddingAction.bind(null, auction.id)}>
            <button type="submit" className={buttonPrimary}>
              Start bidding
            </button>
          </ActionResultForm>
        )}

        {auction.status === "BIDDING" && (
          <Link href={`/auctioneer/auctions/${auction.id}/console`} className={buttonPrimary}>
            Go to auctioneer console
          </Link>
        )}

        {auction.status === "COMPLETED" && (
          <>
            <Link href={`/admin/auctions/${auction.id}/results`} className={buttonSecondary}>
              View results
            </Link>
            <Link href={`/admin/auctions/${auction.id}/fantasy-teams`} className={buttonSecondary}>
              Fantasy teams
            </Link>
            <Link href={`/admin/auctions/${auction.id}/correct-results`} className={buttonSecondary}>
              Correct results
            </Link>
          </>
        )}

        {(auction.status === "PRE_AUCTION_LOCKED" ||
          auction.status === "BIDDING" ||
          auction.status === "COMPLETED") && (
          <Link href={`/admin/auctions/${auction.id}/lock-review`} className={buttonSecondary}>
            Submitted drafts
          </Link>
        )}

        {(auction.status === "BIDDING" || auction.status === "COMPLETED") && (
          <a href={`/api/auctions/${auction.id}/bid-history/export.csv`} className={buttonSecondary}>
            Export bid history
          </a>
        )}
      </section>

      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
