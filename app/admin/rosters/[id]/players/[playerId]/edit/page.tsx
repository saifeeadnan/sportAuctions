import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updatePlayerAction } from "@/lib/actions/roster.actions";
import { PlayerFormFields } from "@/components/roster/PlayerFormFields";

export default async function EditPlayerPage({
  params,
}: {
  params: Promise<{ id: string; playerId: string }>;
}) {
  const { id, playerId } = await params;

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player || player.rosterId !== id) notFound();

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold mb-6">Edit player</h1>

      <form
        action={updatePlayerAction.bind(null, id, playerId)}
        className="flex flex-col gap-3"
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
          <button
            type="submit"
            className="self-start rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
          >
            Save changes
          </button>
          <Link href={`/admin/rosters/${id}`} className="text-sm underline underline-offset-2">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
