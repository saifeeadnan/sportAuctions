import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { isLeagueReadOnly } from "@/lib/services/league.service";
import { ConfirmedRosterTable } from "@/components/roster/ConfirmedRosterTable";
import { DeleteDraftPickButton } from "@/components/admin/DeleteDraftPickButton";
import { ToggleAnalyticsEnabledButton } from "@/components/admin/ToggleAnalyticsEnabledButton";
import { PostAuctionRosterForm } from "@/components/admin/PostAuctionRosterForm";
import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;
  const { leagueId } = await requireAdminOrLeagueAdmin();
  // Enabling analytics is a site-Admin-only capability — leagueId is null
  // only for a site ADMIN (see scopeLeagueId in lib/auth/guards.ts).
  const isSiteAdmin = leagueId === null;

  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: entryId },
    include: { team: true, auction: { include: { tournament: true } } },
  });
  if (!entry || entry.auctionId !== id) notFound();
  assertInScope(leagueId, entry.auction.tournament.leagueId);

  const [confirmedPlayers, draftPicks, league, rosterPlayers, auctionPlayers, categories] =
    await Promise.all([
      prisma.auctionPlayer.findMany({
        where: { soldToEntryId: entryId },
        include: { player: true, category: true },
        orderBy: { player: { name: "asc" } },
      }),
      prisma.preAuctionSubmission.findMany({
        where: { teamAuctionEntryId: entryId },
        include: { auctionPlayer: { include: { player: true, category: true } } },
        orderBy: { auctionPlayer: { player: { name: "asc" } } },
      }),
      prisma.league.findUniqueOrThrow({
        where: { id: entry.auction.tournament.leagueId },
        select: { endDate: true },
      }),
      entry.auction.tournament.rosterId
        ? prisma.player.findMany({
            where: { rosterId: entry.auction.tournament.rosterId },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      prisma.auctionPlayer.findMany({
        where: { auctionId: id },
        include: { category: true },
      }),
      prisma.auctionCategory.findMany({ where: { auctionId: id } }),
    ]);

  const showDraftPicks =
    entry.status === "PRE_AUCTION_DRAFTING" || entry.status === "PRE_AUCTION_SUBMITTED";
  const canDeleteDraftPicks = entry.status === "PRE_AUCTION_DRAFTING";
  const readOnly = isLeagueReadOnly(league);

  // Every roster player not currently SOLD to a team in this auction is a
  // valid replacement — whether or not they were ever added to the pool.
  const auctionPlayerByPlayerId = new Map(auctionPlayers.map((ap) => [ap.playerId, ap]));
  const replacementCandidates = rosterPlayers
    .filter((p) => auctionPlayerByPlayerId.get(p.id)?.status !== "SOLD")
    .map((p) => {
      const ap = auctionPlayerByPlayerId.get(p.id);
      return {
        playerId: p.id,
        playerName: p.name,
        inPool: !!ap,
        categoryId: ap?.categoryId ?? null,
        categoryName: ap?.category.name ?? null,
      };
    });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-8">
      <div>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-xl font-semibold">{entry.team.name}</h1>
          <a
            href={`/api/auctions/${id}/teams/${entryId}/roster-card`}
            className="text-sm underline underline-offset-2 shrink-0"
          >
            Download roster card
          </a>
        </div>
        <p className="text-sm text-black/60 dark:text-white/60">
          {entry.auction.tournament.name} &middot; {entry.auction.name} &middot; status:{" "}
          {entry.status}
        </p>
        <p className="text-sm text-black/60 dark:text-white/60">
          Budget remaining: {String(entry.budgetRemaining)} &middot; Slots: {entry.slotsFilled}/
          {entry.slotsTotal}
        </p>
      </div>

      {isSiteAdmin && (
        <section className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Auction analytics dashboard</h2>
            <p className="text-sm text-black/60 dark:text-white/60">
              {entry.analyticsEnabled
                ? "Enabled — this team's manager can set a bidding strategy and see live guidance."
                : "Not enabled for this team."}
            </p>
          </div>
          <ToggleAnalyticsEnabledButton
            auctionId={id}
            teamAuctionEntryId={entryId}
            teamName={entry.team.name}
            isEnabled={entry.analyticsEnabled}
          />
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium mb-3">Confirmed roster ({confirmedPlayers.length})</h2>
        <ConfirmedRosterTable
          players={confirmedPlayers.map((ap) => ({
            id: ap.id,
            playerName: ap.player.name,
            photoUrl: ap.player.photoUrl,
            categoryName: ap.category.name,
            soldPrice: ap.soldPrice != null ? String(ap.soldPrice) : null,
            soldVia: ap.soldVia,
          }))}
        />
      </section>

      {entry.auction.status === "COMPLETED" && (
        <section>
          <h2 className="text-lg font-medium mb-1">Roster changes</h2>
          <p className="text-sm text-black/60 dark:text-white/60 mb-3">
            For fixing a final roster after the auction — e.g. replacing an injured player.
          </p>
          {readOnly ? (
            <div className={`${card} px-4 py-3 text-sm text-black/40 dark:text-white/40`}>
              This league is read-only — roster changes can no longer be made.
            </div>
          ) : (
            <PostAuctionRosterForm
              auctionId={id}
              teamAuctionEntryId={entryId}
              confirmedPlayers={confirmedPlayers.map((ap) => ({
                auctionPlayerId: ap.id,
                playerName: ap.player.name,
                categoryName: ap.category.name,
                soldPrice: ap.soldPrice != null ? String(ap.soldPrice) : null,
              }))}
              replacementCandidates={replacementCandidates}
              categories={categories.map((c) => ({
                id: c.id,
                name: c.name,
                basePrice: String(c.basePrice),
              }))}
            />
          )}
        </section>
      )}

      {showDraftPicks && (
        <section>
          <h2 className="text-lg font-medium mb-1">
            Pre-auction draft picks ({draftPicks.length})
          </h2>
          <p className="text-sm text-black/60 dark:text-white/60 mb-3">
            Not yet confirmed — these become final once pre-auction is locked and overlaps are
            resolved.
          </p>
          {draftPicks.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              No draft picks submitted yet.
            </p>
          ) : (
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-black/10 dark:border-white/10">
                    <th className="py-2 pl-4 pr-4">Player</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Base price</th>
                    <th className="py-2 pr-4">Status</th>
                    {canDeleteDraftPicks && <th className="py-2 pr-4"></th>}
                  </tr>
                </thead>
                <tbody>
                  {draftPicks.map((pick) => (
                    <tr key={pick.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                      <td className="py-2 pl-4 pr-4">{pick.auctionPlayer.player.name}</td>
                      <td className="py-2 pr-4">{pick.auctionPlayer.category.name}</td>
                      <td className="py-2 pr-4">{String(pick.auctionPlayer.category.basePrice)}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={pick.auctionPlayer.status === "AVAILABLE" ? "warning" : "neutral"}>
                          {pick.auctionPlayer.status === "AVAILABLE" ? "Pending" : pick.auctionPlayer.status}
                        </Badge>
                      </td>
                      {canDeleteDraftPicks && (
                        <td className="py-2 pr-4 text-right">
                          <DeleteDraftPickButton
                            auctionId={id}
                            teamAuctionEntryId={entryId}
                            auctionPlayerId={pick.auctionPlayer.id}
                            playerName={pick.auctionPlayer.player.name}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <Link href={`/admin/auctions/${id}`} className="text-sm underline underline-offset-2">
        Back to auction
      </Link>
    </div>
  );
}
