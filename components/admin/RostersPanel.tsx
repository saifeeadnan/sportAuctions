import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DeleteRosterButton } from "@/components/admin/DeleteRosterButton";
import { UploadRosterForm } from "@/components/roster/UploadRosterForm";

export async function RostersPanel() {
  const rosters = await prisma.playerRoster.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { players: true, tournaments: true } } },
  });

  return (
    <div>
      <h2 className="text-lg font-medium mb-6">Player rosters</h2>

      <details className="mb-8 rounded border border-black/10 dark:border-white/10">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Upload roster
        </summary>
        <UploadRosterForm />
      </details>

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
