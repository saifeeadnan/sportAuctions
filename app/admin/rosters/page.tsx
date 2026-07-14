import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function RostersPage() {
  const rosters = await prisma.playerRoster.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { players: true } } },
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
            <li key={roster.id}>
              <Link
                href={`/admin/rosters/${roster.id}`}
                className="flex items-center justify-between rounded border border-black/10 dark:border-white/10 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span>{roster.name}</span>
                <span className="text-sm text-black/60 dark:text-white/60">
                  {roster._count.players} players
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
