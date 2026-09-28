import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveAdminScope } from "@/lib/auth/scope";
import { assertInScope } from "@/lib/auth/guards";
import { getPickleballEventForAdmin } from "@/lib/services/pickleballEvent.service";
import { UploadPickleballScheduleForm } from "@/components/admin/UploadPickleballScheduleForm";
import { PickleballSharePanel } from "@/components/admin/PickleballSharePanel";
import { PickleballDangerZone } from "@/components/admin/PickleballDangerZone";
import { PickleballTeamSearch } from "@/components/pickleball/PickleballTeamSearch";
import { formatDateTime } from "@/lib/dates";
import { card } from "@/lib/ui";

export default async function PickleballEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { leagueIds } = await resolveAdminScope();

  const pointer = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: { tournamentId: true, tournament: { select: { leagueId: true } } },
  });
  if (!pointer) notFound();
  assertInScope(leagueIds, pointer.tournament.leagueId);

  const event = await getPickleballEventForAdmin(pointer.tournamentId);
  if (!event) notFound();

  const teams = await prisma.team.findMany({
    where: { tournamentId: pointer.tournamentId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div data-wide className="flex flex-col gap-6">
      <div>
        <Link href="/admin/pickleball" className="text-xs text-black/50 dark:text-white/50 hover:underline">
          ← Pickleball
        </Link>
        <h1 className="text-xl font-semibold mb-1">{event.tournamentName}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{event.leagueName}</p>
      </div>

      {!event.hasSchedule ? (
        <details className={card} open>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">Upload schedule</summary>
          <UploadPickleballScheduleForm tournamentId={event.tournamentId} eventId={event.id} teams={teams} />
        </details>
      ) : (
        <>
          <section className={`${card} px-4 py-3 flex flex-col gap-2`}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-medium">{event.fileName}</h2>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Uploaded {event.uploadedAt ? formatDateTime(event.uploadedAt) : "—"} · {event.matches.length} match
                  {event.matches.length === 1 ? "" : "es"}
                  {event.anyGameDataEntered ? " · scoring has started" : ""}
                </p>
              </div>
              <Link href={`/admin/pickleball/${event.id}/score`} className="text-sm underline underline-offset-2 shrink-0">
                Enter scores →
              </Link>
            </div>
            {event.anyGameDataEntered ? (
              <p className="text-xs text-black/50 dark:text-white/50">
                Players or scores have been entered, so the schedule can&apos;t be re-uploaded here — reset all
                scores or delete the event below to change it.
              </p>
            ) : (
              <details className="mt-1">
                <summary className="cursor-pointer select-none text-xs underline underline-offset-2">Replace schedule</summary>
                <UploadPickleballScheduleForm tournamentId={event.tournamentId} eventId={event.id} teams={teams} />
              </details>
            )}
          </section>

          <PickleballSharePanel tournamentId={event.tournamentId} eventId={event.id} token={event.token} hasSchedule={event.hasSchedule} />

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">
              Standings &amp; results{" "}
              <span className="font-normal text-xs text-black/50 dark:text-white/50">— exactly what the public link shows</span>
            </h2>
            <PickleballTeamSearch standings={event.standings} matches={event.matches} />
          </section>
        </>
      )}

      <PickleballDangerZone tournamentId={event.tournamentId} eventId={event.id} anyGameDataEntered={event.anyGameDataEntered} />
    </div>
  );
}
