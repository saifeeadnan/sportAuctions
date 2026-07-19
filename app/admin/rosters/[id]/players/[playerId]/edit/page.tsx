import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updatePlayerAction } from "@/lib/actions/roster.actions";
import { PlayerFormFields } from "@/components/roster/PlayerFormFields";
import { card, buttonPrimary, buttonSecondary } from "@/lib/ui";

export default async function EditPlayerPage({
  params,
}: {
  params: Promise<{ id: string; playerId: string }>;
}) {
  const { id, playerId } = await params;

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player || player.rosterId !== id) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Edit player</h1>

      <div className="flex gap-8 items-start">
        <form
          action={updatePlayerAction.bind(null, id, playerId)}
          className="flex flex-col gap-3 flex-1 max-w-xl"
        >
          <PlayerFormFields
            defaultValues={{
              name: player.name,
              position: player.position,
              age: player.age,
              loginId: player.loginId,
              defaultCategory: player.defaultCategory,
              previousTeam: player.previousTeam,
              photoUrl: player.photoUrl,
              rating: player.rating != null ? String(player.rating) : null,
              battingRating: player.battingRating != null ? String(player.battingRating) : null,
              bowlingRating: player.bowlingRating != null ? String(player.bowlingRating) : null,
              fieldingRating: player.fieldingRating != null ? String(player.fieldingRating) : null,
            }}
          />
          <div className="flex items-center gap-3 mt-2">
            <button type="submit" className={`${buttonPrimary} self-start`}>
              Save changes
            </button>
            <Link href={`/admin/rosters/${id}`} className={`${buttonSecondary} self-start`}>
              Cancel
            </Link>
          </div>
        </form>

        <div
          className={`${card} shrink-0 flex items-center justify-center overflow-hidden`}
          style={{ width: 200, height: 400 }}
        >
          {player.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.photoUrl}
              alt={player.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs text-black/40 dark:text-white/40">No photo</span>
          )}
        </div>
      </div>
    </div>
  );
}
