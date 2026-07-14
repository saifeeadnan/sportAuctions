import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewAuctionForm } from "@/components/admin/NewAuctionForm";

export default async function NewAuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { roster: { include: { players: { orderBy: { name: "asc" } } } } },
  });
  if (!tournament) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold mb-1">New auction</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        {tournament.name} &middot; roster: {tournament.roster.name}
      </p>
      <NewAuctionForm
        tournamentId={tournament.id}
        players={tournament.roster.players.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
        }))}
      />
    </div>
  );
}
