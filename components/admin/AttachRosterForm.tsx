import { attachRosterToTournamentAction } from "@/lib/actions/tournament.actions";
import { ActionResultForm } from "@/components/ui/ActionResultForm";
import { selectClass, buttonPrimary } from "@/lib/ui";

export function AttachRosterForm({
  tournamentId,
  rosters,
}: {
  tournamentId: string;
  rosters: { id: string; name: string }[];
}) {
  if (rosters.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60 px-4 pb-4">
        No rosters exist in this league yet — upload one from the Rosters page, then come back
        here to attach it.
      </p>
    );
  }

  return (
    <ActionResultForm
      action={attachRosterToTournamentAction.bind(null, tournamentId)}
      className="flex flex-col gap-3 max-w-sm px-4 pb-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        Player roster
        <select name="rosterId" required className={selectClass}>
          {rosters.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={`${buttonPrimary} mt-2 self-start`}>
        Attach roster
      </button>
    </ActionResultForm>
  );
}
