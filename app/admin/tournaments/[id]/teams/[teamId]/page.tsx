import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConfirmedRosterTable } from "@/components/roster/ConfirmedRosterTable";

export default async function TournamentTeamRosterPage({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id, teamId } = await params;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      tournament: true,
      manager: true,
      entries: {
        include: {
          auction: true,
          playersWon: { include: { player: true, category: true }, orderBy: { player: { name: "asc" } } },
        },
        orderBy: { auction: { createdAt: "desc" } },
      },
    },
  });
  if (!team || team.tournamentId !== id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">{team.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {team.tournament.name} &middot;{" "}
          {team.manager ? `Manager: ${team.manager.name}` : "No manager assigned"}
        </p>
      </div>

      {team.entries.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          This team hasn&apos;t participated in an auction yet.
        </p>
      ) : (
        team.entries.map((entry) => (
          <section key={entry.id}>
            <h2 className="text-lg font-medium mb-1">{entry.auction.name}</h2>
            <p className="text-sm text-black/60 dark:text-white/60 mb-3">
              Status: {entry.status} &middot; Budget remaining: {String(entry.budgetRemaining)}{" "}
              &middot; Slots: {entry.slotsFilled}/{entry.slotsTotal}
            </p>
            <ConfirmedRosterTable
              players={entry.playersWon.map((ap) => ({
                id: ap.id,
                playerName: ap.player.name,
                categoryName: ap.category.name,
                soldPrice: ap.soldPrice != null ? String(ap.soldPrice) : null,
                soldVia: ap.soldVia,
              }))}
            />
            <Link
              href={`/admin/auctions/${entry.auctionId}/teams/${entry.id}`}
              className="text-sm underline underline-offset-2 mt-2 inline-block"
            >
              View full details for this auction
            </Link>
          </section>
        ))
      )}

      <Link href={`/admin/tournaments/${id}`} className="text-sm underline underline-offset-2">
        Back to tournament
      </Link>
    </div>
  );
}
