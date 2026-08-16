import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { isLeagueReadOnly } from "@/lib/services/league.service";
import { NewAuctionForm } from "@/components/admin/NewAuctionForm";

export default async function NewAuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { leagueIds } = await requireAdminOrLeagueAdmin();
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { roster: { include: { players: { orderBy: { name: "asc" } } } } },
  });
  if (!tournament) notFound();
  assertInScope(leagueIds, tournament.leagueId);

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: tournament.leagueId },
    select: { endDate: true },
  });
  if (isLeagueReadOnly(league)) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-1">New auction</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          This league is read-only — no new auctions can be created.
        </p>
      </div>
    );
  }

  if (!tournament.roster) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-1">New auction</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {tournament.name} has no roster attached yet.{" "}
          <Link href={`/admin/tournaments/${tournament.id}`} className="underline underline-offset-2">
            Attach one from the tournament page
          </Link>{" "}
          before creating an auction.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">New auction</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-4">
        {tournament.name} &middot; roster: {tournament.roster.name}
      </p>
      <NewAuctionForm
        tournamentId={tournament.id}
        players={tournament.roster.players.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          defaultCategory: p.defaultCategory,
        }))}
      />
    </div>
  );
}
