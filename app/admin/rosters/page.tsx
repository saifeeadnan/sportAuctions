import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DeleteRosterButton } from "@/components/admin/DeleteRosterButton";

export default async function RostersPage() {
  const rosters = await prisma.playerRoster.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { players: true, tournaments: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Player rosters</h1>
        <Link
          href="/admin/rosters/new"
          className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
        >
          Upload roster
        </Link>
      </div>

      {rosters.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No rosters yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rosters.map((roster) => (
            <li
              key={roster.id}
              className="flex items-center justify-between gap-4 rounded border border-black/10 dark:border-white/10 px-4 py-3"
            >
              <Link
                href={`/admin/rosters/${roster.id}`}
                className="flex-1 flex items-center justify-between hover:underline"
              >
                <span>{roster.name}</span>
                <span className="text-sm text-black/60 dark:text-white/60 mr-4">
                  {roster._count.players} players
                </span>
              </Link>
              <DeleteRosterButton
                rosterId={roster.id}
                rosterName={roster.name}
                inUseCount={roster._count.tournaments}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
