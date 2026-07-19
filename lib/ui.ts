// Shared style primitives — plain Tailwind class strings rather than wrapper
// components, so they drop into existing server components, `<Link>`s, and
// native form elements without changing how any of them behave.

export const card =
  "rounded-xl border border-black/[0.08] dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-sm";

export const cardInteractive = `${card} hover:border-black/15 dark:hover:border-white/20 hover:shadow-md transition-shadow`;

export const buttonPrimary =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const buttonSecondary =
  "inline-flex items-center justify-center rounded-lg border border-black/15 dark:border-white/15 px-3 py-2 text-sm font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const buttonDanger =
  "inline-flex items-center justify-center rounded-lg border border-red-500/40 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/5 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const inputClass =
  "rounded-lg border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-colors";

export const tabsTrack = "inline-flex flex-wrap gap-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] p-1";

export function tabItem(active: boolean) {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
      : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
  }`;
}
