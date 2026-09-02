"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeagueRosterFieldConfigAction } from "@/lib/actions/roster.actions";
import {
  ROSTER_FIELD_KEYS,
  ROSTER_FIELD_LABELS,
  ROSTER_TEMPLATES,
  matchingRosterTemplateKey,
  type RosterFieldKey,
} from "@/lib/rosterTemplates";
import { buttonPrimary, buttonSecondary } from "@/lib/ui";

export function RosterFieldConfigForm({
  leagueId,
  mandatoryFields,
}: {
  leagueId: string;
  mandatoryFields: RosterFieldKey[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<RosterFieldKey>>(new Set(mandatoryFields));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLabel = matchingRosterTemplateKey(mandatoryFields);
  const summary =
    currentLabel != null
      ? ROSTER_TEMPLATES[currentLabel].label
      : mandatoryFields.length === 0
        ? "Generic"
        : "Custom";

  function reset() {
    setSelected(new Set(mandatoryFields));
    setError(null);
  }

  function toggle(field: RosterFieldKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
      >
        Roster template ({summary})
      </button>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await updateLeagueRosterFieldConfigAction(leagueId, [...selected]);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 mt-2 mb-1 max-w-sm">
      <p className="text-xs text-black/60 dark:text-white/60">
        Choose which roster fields must be filled in on every upload for this league. Applies to
        the downloadable template and CSV imports.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {(Object.keys(ROSTER_TEMPLATES) as (keyof typeof ROSTER_TEMPLATES)[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelected(new Set(ROSTER_TEMPLATES[key].mandatoryFields))}
            className={`${buttonSecondary} px-2 py-1 text-xs`}
          >
            {ROSTER_TEMPLATES[key].label} preset
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {ROSTER_FIELD_KEYS.map((field) => (
          <label key={field} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selected.has(field)}
              onChange={() => toggle(field)}
            />
            {ROSTER_FIELD_LABELS[field]}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={handleSave}
          className={`${buttonPrimary} px-2 py-1 text-xs`}
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className={`${buttonSecondary} px-2 py-1 text-xs`}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
