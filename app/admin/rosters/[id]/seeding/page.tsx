import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedRoster } from "@/lib/auth/scope";
import { getSeedingSummary } from "@/lib/services/playerSeeding.service";
import { SeedingResolutionForm } from "@/components/admin/SeedingResolutionForm";
import { withLeagueParam } from "@/lib/adminNav";
import { formatDateTime } from "@/lib/dates";

export default async function RosterSeedingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const { id } = await params;
  const { league: leagueParam } = await searchParams;
  const { leagueIds } = await requireAdminOrLeagueAdmin();
  const roster = await loadScopedRoster(id, leagueIds);

  const seeding = await getSeedingSummary(id);
  if (!seeding.window) notFound();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{roster.name} — resolve seeding</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-1">
        Rating window: {formatDateTime(seeding.window.opensAt)} – {formatDateTime(seeding.window.closesAt)} ·{" "}
        {seeding.participation.submitted} of {seeding.participation.eligible} eligible members rated.
      </p>
      <p className="text-sm text-black/60 dark:text-white/60 mb-5">
        Rows are ordered by average seed (lower = better). Reorder with the ▲/▼ buttons to break ties or
        override the suggestion, then finalize to publish a unique seed per player.
      </p>

      <SeedingResolutionForm
        rosterId={id}
        isFinalized={seeding.window.finalizedAt != null}
        rows={seeding.rows.map((r) => ({
          playerId: r.playerId,
          name: r.name,
          position: r.position,
          photoUrl: r.photoUrl,
          avgSeed: r.avgSeed,
          ratingCount: r.ratingCount,
          tieGroup: r.tieGroup,
          currentSeed: r.currentSeed,
        }))}
      />

      <Link
        href={withLeagueParam(`/admin/rosters/${id}`, leagueParam)}
        className="text-sm underline underline-offset-2 mt-6 inline-block"
      >
        Back to roster
      </Link>
    </div>
  );
}
