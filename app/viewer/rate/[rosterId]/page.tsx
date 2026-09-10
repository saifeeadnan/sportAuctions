import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import { getSeedingSheet } from "@/lib/services/playerSeeding.service";
import { RatePlayersForm } from "@/components/viewer/RatePlayersForm";
import { formatDateTime } from "@/lib/dates";
import { Badge } from "@/components/ui/Badge";

export default async function ViewerRateRosterPage({
  params,
}: {
  params: Promise<{ rosterId: string }>;
}) {
  const { rosterId } = await params;
  const session = await requireRole("VIEWER", "TEAM_MANAGER");
  const sheet = await getSeedingSheet(rosterId, session.user.id, allLeagueIds(session));

  if (!sheet.eligible) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-black/60 dark:text-white/60">{sheet.reason}</p>
      </div>
    );
  }

  if (sheet.status === "scheduled") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-semibold mb-1">Rate players</h1>
        <p className="text-black/60 dark:text-white/60">
          Rating opens <span className="font-medium">{formatDateTime(sheet.opensAt)}</span>.
        </p>
      </div>
    );
  }

  if (sheet.status === "closed") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-semibold mb-1">Rate players</h1>
        <p className="text-black/60 dark:text-white/60">
          Rating closed on {formatDateTime(sheet.closesAt)}. The admin is finalizing the seeding — check back
          soon.
        </p>
      </div>
    );
  }

  if (sheet.status === "finalized") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-semibold mb-1">Final seeding</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mb-4">
          Peer rating has closed and the seeding below is final.
        </p>
        <div className="rounded-xl border border-black/[0.08] dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]">
                <th className="py-2 pl-4 pr-4">Seed</th>
                <th className="py-2 pr-4">Player</th>
              </tr>
            </thead>
            <tbody>
              {sheet.finalSeeding.map((row) => (
                <tr key={row.playerId} className="border-b border-black/5 dark:border-white/5 last:border-0">
                  <td className="py-2 pl-4 pr-4 font-medium">{row.seed}</td>
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-2">
                      {row.name}
                      {row.position && (
                        <span className="text-black/50 dark:text-white/50">({row.position})</span>
                      )}
                      {row.playerId === sheet.selfPlayerId && <Badge variant="info">You</Badge>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // status === "open"
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold mb-1">Rate players</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Seed each player from 1 (best) to {sheet.maxSeed}, leave blank to skip. Your answers are
        anonymous and you can change them until {formatDateTime(sheet.closesAt)}.
      </p>
      <RatePlayersForm rosterId={rosterId} players={sheet.players} maxSeed={sheet.maxSeed} />
    </div>
  );
}
