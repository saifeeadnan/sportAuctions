import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createPlayerAction } from "@/lib/actions/roster.actions";
import { PlayerFormFields } from "@/components/roster/PlayerFormFields";
import { DeletePlayerButton } from "@/components/admin/DeletePlayerButton";

export default async function RosterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const roster = await prisma.playerRoster.findUnique({
    where: { id },
    include: { players: { orderBy: { name: "asc" } } },
  });

  if (!roster) notFound();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{roster.name}</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        {roster.players.length} players
      </p>

      <details className="mb-6 rounded border border-black/10 dark:border-white/10">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Add player
        </summary>
        <form
          action={createPlayerAction.bind(null, roster.id)}
          className="flex flex-col gap-3 max-w-xl px-4 pb-4"
        >
          <PlayerFormFields />
          <button
            type="submit"
            className="mt-2 self-start rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
          >
            Add player
          </button>
        </form>
      </details>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Position</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Rating</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {roster.players.map((player) => (
            <tr key={player.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-4">{player.name}</td>
              <td className="py-2 pr-4">{player.position ?? "—"}</td>
              <td className="py-2 pr-4">{player.defaultCategory ?? "—"}</td>
              <td className="py-2 pr-4">
                {player.rating != null ? String(player.rating) : "—"}
              </td>
              <td className="py-2 pr-4">
                <div className="flex items-center justify-end gap-3">
                  <Link
                    href={`/admin/rosters/${roster.id}/players/${player.id}/edit`}
                    className="text-xs underline underline-offset-2"
                  >
                    Edit
                  </Link>
                  <DeletePlayerButton
                    rosterId={roster.id}
                    playerId={player.id}
                    playerName={player.name}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
