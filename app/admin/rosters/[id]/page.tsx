import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

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

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Position</th>
            <th className="py-2 pr-4">Age</th>
            <th className="py-2 pr-4">Contact</th>
            <th className="py-2 pr-4">Rating</th>
          </tr>
        </thead>
        <tbody>
          {roster.players.map((player) => (
            <tr key={player.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-4">{player.name}</td>
              <td className="py-2 pr-4">{player.position ?? "—"}</td>
              <td className="py-2 pr-4">{player.age ?? "—"}</td>
              <td className="py-2 pr-4">{player.contact ?? "—"}</td>
              <td className="py-2 pr-4">
                {player.rating != null ? String(player.rating) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
