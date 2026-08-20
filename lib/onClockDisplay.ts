// Shared between the server (validation) and the client (wizard/settings
// forms) — kept free of server-only imports, same pattern as
// lib/auctionTypes.ts, so it's safe to bundle into client components.

export const ON_CLOCK_TEMPLATES = ["CLASSIC", "PHOTO_FOCUS", "STATS_TABLE"] as const;
export type OnClockTemplate = (typeof ON_CLOCK_TEMPLATES)[number];

export const ON_CLOCK_TEMPLATE_LABELS: Record<OnClockTemplate, string> = {
  CLASSIC: "Classic",
  PHOTO_FOCUS: "Photo focus",
  STATS_TABLE: "Stats table",
};

export const ON_CLOCK_TEMPLATE_DESCRIPTIONS: Record<OnClockTemplate, string> = {
  CLASSIC: "Small photo, name, category & price, bid count, previous team — today's default look.",
  PHOTO_FOCUS: "Large hero photo, minimal text, name front and center.",
  STATS_TABLE: "Dense grid showing every selected field, including all rating fields.",
};

// Toggleable Player-roster fields only — name, category+price, and bid count
// are core bidding info and stay permanently on in every template.
export const ON_CLOCK_FIELD_KEYS = [
  "photoUrl",
  "position",
  "age",
  "previousTeam",
  "rating",
  "battingRating",
  "bowlingRating",
  "fieldingRating",
] as const;
export type OnClockFieldKey = (typeof ON_CLOCK_FIELD_KEYS)[number];

export const ON_CLOCK_FIELD_LABELS: Record<OnClockFieldKey, string> = {
  photoUrl: "Photo",
  position: "Position",
  age: "Age",
  previousTeam: "Previous team",
  rating: "Overall rating",
  battingRating: "Batting rating",
  bowlingRating: "Bowling rating",
  fieldingRating: "Fielding rating",
};

// Reproduces today's hardcoded OnClockCard output exactly, so an auction
// created before this feature shipped keeps looking the same.
export const DEFAULT_ON_CLOCK_VISIBLE_FIELDS: OnClockFieldKey[] = ["photoUrl", "previousTeam"];
