import { listLeagues } from "@/lib/services/league.service";
import { createLeagueAction } from "@/lib/actions/league.actions";
import { ActionResultForm } from "@/components/ui/ActionResultForm";
import { DeleteLeagueButton } from "@/components/admin/DeleteLeagueButton";
import { CopyInviteLinkButton } from "@/components/admin/CopyInviteLinkButton";
import { UploadLeagueLogoForm } from "@/components/admin/UploadLeagueLogoForm";
import { DeleteLeagueLogoButton } from "@/components/admin/DeleteLeagueLogoButton";
import { card, cardInteractive, buttonPrimary, inputClass } from "@/lib/ui";

export async function LeaguesPanel() {
  const leagues = await listLeagues();

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Leagues</h2>

      <details className={`${card} mb-6`}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          New league
        </summary>
        <ActionResultForm action={createLeagueAction} className="flex flex-col gap-3 max-w-xl px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              League name
              <input name="name" required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Type
              <input name="type" required placeholder="Cricket, Soccer, Frisbee…" className={inputClass} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Logo (JPG or PNG, optional)
            <input name="logo" type="file" accept="image/jpeg,image/png" className={`text-sm ${inputClass}`} />
          </label>
          <button type="submit" className={`${buttonPrimary} mt-2 self-start`}>
            Create league
          </button>
        </ActionResultForm>
      </details>

      {leagues.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No leagues yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {leagues.map((league) => (
            <li key={league.id} className={`${cardInteractive} px-4 py-2 flex flex-col`}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="flex items-center gap-2">
                  {league.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/leagues/${league.id}/logo`}
                      alt={`${league.name} logo`}
                      className="h-6 w-6 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-0.5 shrink-0"
                    />
                  ) : null}
                  {league.name}{" "}
                  <span className="text-black/50 dark:text-white/50">({league.type})</span>
                </span>
                <span className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-black/60 dark:text-white/60">
                    {league._count.users} users &middot; {league._count.rosters} rosters &middot;{" "}
                    {league._count.tournaments} tournaments
                  </span>
                  <CopyInviteLinkButton path={`/register?league=${league.id}`} />
                  <DeleteLeagueButton
                    leagueId={league.id}
                    leagueName={league.name}
                    userCount={league._count.users}
                    rosterCount={league._count.rosters}
                    tournamentCount={league._count.tournaments}
                  />
                </span>
              </div>
              <details>
                <summary className="cursor-pointer select-none w-fit text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors">
                  {league.logo ? "Replace logo" : "Upload logo"}
                </summary>
                <div className="mt-2 mb-1 flex flex-col gap-2 max-w-xs">
                  {league.logo && <DeleteLeagueLogoButton leagueId={league.id} />}
                  <UploadLeagueLogoForm leagueId={league.id} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
