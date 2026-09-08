/**
 * The "▲ 2" / "▼ 1" chip beside a fantasy team's rank — its movement since
 * the previous points upload. ▲/▼ rather than ↑/↓, which FantasyStandingsList's
 * sort links already use to mean sort direction. Renders nothing when there's
 * no previous upload to compare against (delta null and not new); `isNew`
 * marks a team submitted after the previous upload, which has no honest
 * "before" rank.
 */
export function RankMovement({ delta, isNew = false }: { delta: number | null; isNew?: boolean }) {
  if (isNew) {
    return (
      <span
        className="text-[10px] font-semibold uppercase tracking-wide text-black/40 dark:text-white/40"
        title="First appearance — no previous points upload to compare against"
      >
        new
      </span>
    );
  }
  if (delta == null) return null;
  if (delta === 0) {
    return (
      <span className="text-xs text-black/40 dark:text-white/40" title="No change since the previous points upload">
        –
      </span>
    );
  }
  const up = delta > 0;
  const places = Math.abs(delta);
  return (
    <span
      className={`text-xs font-semibold whitespace-nowrap ${
        up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
      title={`${up ? "Up" : "Down"} ${places} place${places === 1 ? "" : "s"} since the previous points upload`}
    >
      {up ? "▲" : "▼"} {places}
    </span>
  );
}
