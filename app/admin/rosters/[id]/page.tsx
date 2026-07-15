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

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pr-4 whitespace-nowrap">Name</th>
              <th className="py-2 pr-4 whitespace-nowrap">Position</th>
              <th className="py-2 pr-4 whitespace-nowrap">Age</th>
              <th className="py-2 pr-4 whitespace-nowrap">Login ID</th>
              <th className="py-2 pr-4 whitespace-nowrap">Default category</th>
              <th className="py-2 pr-4 whitespace-nowrap">Previous team</th>
              <th className="py-2 pr-4 whitespace-nowrap">Rating</th>
              <th className="py-2 pr-4 whitespace-nowrap">Batting</th>
              <th className="py-2 pr-4 whitespace-nowrap">Bowling</th>
              <th className="py-2 pr-4 whitespace-nowrap">Fielding</th>
            </tr>
          </thead>
          <tbody>
            {roster.players.map((player) => (
              <tr key={player.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4 whitespace-nowrap">{player.name}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{player.position ?? "—"}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{player.age ?? "—"}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{player.loginId ?? "—"}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{player.defaultCategory ?? "—"}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{player.previousTeam ?? "—"}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {player.rating != null ? String(player.rating) : "—"}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {player.battingRating != null ? String(player.battingRating) : "—"}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {player.bowlingRating != null ? String(player.bowlingRating) : "—"}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {player.fieldingRating != null ? String(player.fieldingRating) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
