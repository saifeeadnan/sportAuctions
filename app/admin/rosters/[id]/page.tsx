import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createPlayerAction } from "@/lib/actions/roster.actions";
import { PlayerFormFields } from "@/components/roster/PlayerFormFields";
import { DeletePlayerButton } from "@/components/admin/DeletePlayerButton";

const SORT_FIELDS = ["name", "position", "category", "rating"] as const;
type SortField = (typeof SORT_FIELDS)[number];
type SortDir = "asc" | "desc";

const SORT_FIELD_TO_COLUMN: Record<SortField, string> = {
  name: "name",
  position: "position",
  category: "defaultCategory",
  rating: "rating",
};

function resolveSortField(value?: string): SortField {
  return SORT_FIELDS.includes(value as SortField) ? (value as SortField) : "name";
}

function resolveSortDir(value?: string): SortDir {
  return value === "desc" ? "desc" : "asc";
}

function sortHref(field: SortField, activeField: SortField, activeDir: SortDir): string {
  const nextDir: SortDir = activeField === field && activeDir === "asc" ? "desc" : "asc";
  return `?sort=${field}&dir=${nextDir}`;
}

export default async function RosterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const { id } = await params;
  const { sort, dir } = await searchParams;
  const sortField = resolveSortField(sort);
  const sortDir = resolveSortDir(dir);

  const orderByValue =
    sortField === "name" ? sortDir : { sort: sortDir, nulls: "last" as const };

  const roster = await prisma.playerRoster.findUnique({
    where: { id },
    include: {
      players: {
        orderBy: { [SORT_FIELD_TO_COLUMN[sortField]]: orderByValue },
      },
    },
  });

  if (!roster) notFound();

  const columns: { field: SortField; label: string }[] = [
    { field: "name", label: "Name" },
    { field: "position", label: "Position" },
    { field: "category", label: "Category" },
    { field: "rating", label: "Rating" },
  ];

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
            {columns.map((col) => (
              <th key={col.field} className="py-2 pr-4">
                <Link
                  href={sortHref(col.field, sortField, sortDir)}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {col.label}
                  {sortField === col.field && (
                    <span className="text-black/50 dark:text-white/50">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </Link>
              </th>
            ))}
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
