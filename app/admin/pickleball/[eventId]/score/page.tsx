import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveAdminScope } from "@/lib/auth/scope";
import { assertInScope } from "@/lib/auth/guards";
import { getMatchesForScoring } from "@/lib/services/pickleballScoring.service";
import { PickleballScoreBoard } from "@/components/admin/PickleballScoreBoard";

export default async function PickleballScorePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { leagueIds } = await resolveAdminScope();

  const pointer = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: { tournamentId: true, tournament: { select: { name: true, leagueId: true } } },
  });
  if (!pointer) notFound();
  assertInScope(leagueIds, pointer.tournament.leagueId);

  const matches = await getMatchesForScoring(pointer.tournamentId, eventId);
  if (matches.length === 0) notFound();

  return (
    <div data-wide className="flex flex-col gap-6">
      <div>
        <Link href={`/admin/pickleball/${eventId}`} className="text-xs text-black/50 dark:text-white/50 hover:underline">
          ← {pointer.tournament.name}
        </Link>
        <h1 className="text-xl font-semibold">Scoring</h1>
      </div>
      <PickleballScoreBoard tournamentId={pointer.tournamentId} eventId={eventId} matches={matches} />
    </div>
  );
}
