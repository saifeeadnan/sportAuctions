// Auction categories are free-text, admin-defined strings (Icon/Gold/Silver,
// or literally anything), not a fixed enum — so category color-coding has to
// be a deterministic hash into a small fixed palette, not a lookup keyed on
// specific names. Same hash shape as the roster-card PNG generator's
// colorFor() (app/api/auctions/[id]/teams/[entryId]/roster-card/route.tsx),
// applied to Tailwind classes instead of raw hex.
//
// Tailwind v4 (this app has no tailwind.config.*, just `@import "tailwindcss"`
// in app/globals.css) statically scans source for literal class-name
// strings — every entry below MUST stay written out in full. Never build a
// class name like `bg-${hue}-500` from a variable; the scanner won't see it
// and the utility silently goes missing from the production build.

export type CategoryAccent = {
  /** Translucent pill on a plain card background. */
  chipSoft: string;
  /** Solid pill — needs guaranteed contrast sitting over an arbitrary photo. */
  chipSolid: string;
  /** ring-* for a circular avatar/photo accent. */
  ring: string;
  /** Solid bg-* for a thin top accent stripe. */
  bar: string;
  /** bg-gradient-to-br fill for the initials-avatar fallback. */
  avatarGradient: string;
};

// 7 hues, deliberately not indigo/violet (the app's own UI accent — buttons,
// focus rings) and not red (Badge's `danger` variant) — a category's color
// should read as content, not compete with the app's own chrome.
const PALETTE: CategoryAccent[] = [
  {
    chipSoft: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    chipSolid: "bg-amber-600 dark:bg-amber-500 text-white",
    ring: "ring-amber-500/60 dark:ring-amber-400/60",
    bar: "bg-amber-500 dark:bg-amber-400",
    avatarGradient: "bg-gradient-to-br from-amber-500 to-amber-700",
  },
  {
    chipSoft: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    chipSolid: "bg-orange-600 dark:bg-orange-500 text-white",
    ring: "ring-orange-500/60 dark:ring-orange-400/60",
    bar: "bg-orange-500 dark:bg-orange-400",
    avatarGradient: "bg-gradient-to-br from-orange-500 to-orange-700",
  },
  {
    chipSoft: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    chipSolid: "bg-rose-600 dark:bg-rose-500 text-white",
    ring: "ring-rose-500/60 dark:ring-rose-400/60",
    bar: "bg-rose-500 dark:bg-rose-400",
    avatarGradient: "bg-gradient-to-br from-rose-500 to-rose-700",
  },
  {
    chipSoft: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    chipSolid: "bg-sky-600 dark:bg-sky-500 text-white",
    ring: "ring-sky-500/60 dark:ring-sky-400/60",
    bar: "bg-sky-500 dark:bg-sky-400",
    avatarGradient: "bg-gradient-to-br from-sky-500 to-sky-700",
  },
  {
    chipSoft: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    chipSolid: "bg-emerald-600 dark:bg-emerald-500 text-white",
    ring: "ring-emerald-500/60 dark:ring-emerald-400/60",
    bar: "bg-emerald-500 dark:bg-emerald-400",
    avatarGradient: "bg-gradient-to-br from-emerald-500 to-emerald-700",
  },
  {
    chipSoft: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400",
    chipSolid: "bg-fuchsia-600 dark:bg-fuchsia-500 text-white",
    ring: "ring-fuchsia-500/60 dark:ring-fuchsia-400/60",
    bar: "bg-fuchsia-500 dark:bg-fuchsia-400",
    avatarGradient: "bg-gradient-to-br from-fuchsia-500 to-fuchsia-700",
  },
  {
    chipSoft: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
    chipSolid: "bg-teal-600 dark:bg-teal-500 text-white",
    ring: "ring-teal-500/60 dark:ring-teal-400/60",
    bar: "bg-teal-500 dark:bg-teal-400",
    avatarGradient: "bg-gradient-to-br from-teal-500 to-teal-700",
  },
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function categoryAccent(categoryName: string): CategoryAccent {
  return PALETTE[hashString(categoryName) % PALETTE.length];
}
