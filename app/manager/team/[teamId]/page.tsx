import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ConfirmedRosterTable } from "@/components/roster/ConfirmedRosterTable";
import { RosterCardLinkPanel } from "@/components/roster/RosterCardLinkPanel";
import { Badge } from "@/components/ui/Badge";

const ENTRY_STATUS_VARIANT: Record<string, "neutral" | "info" | "success" | "warning"> = {
  AUCTION_LIVE: "info",
  FINAL: "success",
  ALLOCATED_PRE_AUCTION: "warning",
  PRE_AUCTION_SUBMITTED: "warning",
};

const DRAFT_STATUSES = new Set(["PRE_AUCTION_DRAFTING", "PRE_AUCTION_SUBMITTED", "ALLOCATED_PRE_AUCTION"]);
const LIVE_STATUSES = new Set(["AUCTION_LIVE", "FINAL"]);

export default async function ManagerTeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const session = await auth();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      tournament: true,
      sponsorImage: { select: { id: true } },
      entries: {
        include: {
          auction: true,
          playersWon: {
            include: { player: true, category: true },
            orderBy: { player: { name: "asc" } },
          },
        },
        orderBy: { auction: { createdAt: "desc" } },
      },
    },
  });
  if (!team || team.managerId !== session!.user.id) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          {team.sponsorImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/teams/${team.id}/sponsor-image`}
              alt={`${team.name} sponsor`}
              // 20% larger than the standard h-10/w-10 (40px) used elsewhere.
              className="h-12 w-12 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1 shrink-0"
            />
          )}
          <h1 className="text-xl font-semibold">{team.name}</h1>
        </div>
        <p className="text-sm text-black/60 dark:text-white/60">{team.tournament.name}</p>
      </div>

      {team.entries.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          This team hasn&apos;t participated in an auction yet.
        </p>
      ) : (
        team.entries.map((entry) => (
          <section key={entry.id}>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-medium">{entry.auction.name}</h2>
              <Badge variant={ENTRY_STATUS_VARIANT[entry.status] ?? "neutral"}>{entry.status}</Badge>
            </div>
            <p className="text-sm text-black/60 dark:text-white/60 mb-3">
              Budget remaining: {String(entry.budgetRemaining)} &middot; Slots: {entry.slotsFilled}/
              {entry.slotsTotal}
            </p>
            <ConfirmedRosterTable
              players={entry.playersWon.map((ap) => ({
                id: ap.id,
                playerName: ap.player.name,
                photoUrl: ap.player.photoUrl,
                categoryName: ap.category.name,
                soldPrice: ap.soldPrice != null ? String(ap.soldPrice) : null,
                soldVia: ap.soldVia,
                isCaptain: ap.id === entry.captainAuctionPlayerId,
              }))}
            />
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {DRAFT_STATUSES.has(entry.status) && (
                <Link
                  href={`/manager/teams/${entry.id}/draft`}
                  className="text-sm underline underline-offset-2"
                >
                  {entry.status === "ALLOCATED_PRE_AUCTION" ? "View draft results" : "Submit draft"}
                </Link>
              )}
              {LIVE_STATUSES.has(entry.status) && (
                <Link
                  href={`/manager/teams/${entry.id}/live`}
                  className="text-sm underline underline-offset-2"
                >
                  View live
                </Link>
              )}
              {entry.analyticsEnabled && (
                <Link
                  href={`/manager/teams/${entry.id}/analytics`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline underline-offset-2"
                >
                  Analytics dashboard
                </Link>
              )}
              <a
                href={`/api/auctions/${entry.auctionId}/teams/${entry.id}/roster-card`}
                className="text-sm underline underline-offset-2"
              >
                Download roster card
              </a>
              {entry.auction.status === "COMPLETED" && (
                <RosterCardLinkPanel
                  auctionId={entry.auctionId}
                  entryId={entry.id}
                  initialToken={entry.rosterCardToken}
                />
              )}
            </div>
          </section>
        ))
      )}

      <Link href="/manager" className="text-sm underline underline-offset-2">
        &larr; Back to tournaments
      </Link>
    </div>
  );
}
