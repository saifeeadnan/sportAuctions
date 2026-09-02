// Shared between the server (validation, template generation) and the client
// (league roster-field-config UI) — kept free of server-only imports, same
// pattern as lib/onClockDisplay.ts, so it's safe to bundle into client
// components.

// Every Player field an uploaded/manually-added roster row can carry, minus
// `name` (always required, not configurable) — the fixed, closed set this
// feature toggles "mandatory" on/off for. Order matches
// lib/services/roster.service.ts's ROSTER_EXPORT_COLUMNS / PlayerFormFields
// so a checklist UI lists them in a familiar order.
export const ROSTER_FIELD_KEYS = [
  "position",
  "age",
  "loginId",
  "email",
  "phone",
  "defaultCategory",
  "previousTeam",
  "photoUrl",
  "rating",
  "battingRating",
  "bowlingRating",
  "fieldingRating",
] as const;
export type RosterFieldKey = (typeof ROSTER_FIELD_KEYS)[number];

export const ROSTER_FIELD_LABELS: Record<RosterFieldKey, string> = {
  position: "Position",
  age: "Age",
  loginId: "Login ID",
  email: "Email",
  phone: "Phone",
  defaultCategory: "Default category",
  previousTeam: "Previous team",
  photoUrl: "Photo URL",
  rating: "Rating",
  battingRating: "Batting rating",
  bowlingRating: "Bowling rating",
  fieldingRating: "Fielding rating",
};

export const ROSTER_TEMPLATE_KEYS = ["GENERIC", "CRICKET"] as const;
export type RosterTemplateKey = (typeof ROSTER_TEMPLATE_KEYS)[number];

export const ROSTER_TEMPLATES: Record<
  RosterTemplateKey,
  { label: string; mandatoryFields: RosterFieldKey[] }
> = {
  GENERIC: {
    label: "Generic",
    // The baseline every league starts with (matches the League.
    // mandatoryRosterFields column default) — no sport-specific fields, but
    // email and phone are required everywhere so every player roster has a
    // way to reach the person. A league can still uncheck these if it
    // genuinely doesn't need them.
    mandatoryFields: ["email", "phone"],
  },
  CRICKET: {
    label: "Cricket",
    // Kept modest — the admin can always check more boxes after picking
    // this preset. battingRating/bowlingRating/fieldingRating are left
    // optional by default even though they're cricket-specific columns,
    // since not every cricket league scores every discipline at
    // roster-upload time. Still carries the email/phone baseline so picking
    // a sport preset doesn't silently drop it.
    mandatoryFields: ["position", "email", "phone"],
  },
};

/** Purely a display convenience — "which preset am I currently based on."
 * Not stored: derived by comparing the league's current
 * mandatoryRosterFields array (order-independent) against each preset's
 * fixed list. Returns null once the admin has customized away from every
 * known preset ("Custom"). */
export function matchingRosterTemplateKey(mandatoryFields: string[]): RosterTemplateKey | null {
  const sorted = [...mandatoryFields].sort();
  for (const key of ROSTER_TEMPLATE_KEYS) {
    const presetSorted = [...ROSTER_TEMPLATES[key].mandatoryFields].sort();
    if (sorted.length === presetSorted.length && sorted.every((f, i) => f === presetSorted[i])) {
      return key;
    }
  }
  return null;
}
