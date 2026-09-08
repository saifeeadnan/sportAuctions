import type { getFantasyStandings } from "@/lib/services/fantasyTeam.service";

export type FantasyStanding = Awaited<ReturnType<typeof getFantasyStandings>>["standings"][number];

export type FantasySortKey = "rank" | "user" | "spend";
export type FantasySortDir = "asc" | "desc";

export const FANTASY_SORT_LABELS: Record<FantasySortKey, string> = {
  rank: "Rank",
  user: "Team",
  spend: "Spent",
};

// Each column's sensible direction the first time it's clicked — rank and
// spend both read most-relevant-first (best rank, biggest spender), user
// reads alphabetically.
const DEFAULT_DIR: Record<FantasySortKey, FantasySortDir> = {
  rank: "asc",
  user: "asc",
  spend: "desc",
};

/** Parses raw `?sort=`/`?dir=` search params into a valid, defaulted sort state. */
export function resolveFantasySort(rawSort?: string, rawDir?: string) {
  const sortKey: FantasySortKey = rawSort === "user" || rawSort === "spend" ? rawSort : "rank";
  const sortDir: FantasySortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : DEFAULT_DIR[sortKey];
  return { sortKey, sortDir };
}

export function sortFantasyStandings<T extends FantasyStanding>(
  standings: T[],
  sortKey: FantasySortKey,
  sortDir: FantasySortDir
): T[] {
  return [...standings].sort((a, b) => {
    const cmp =
      sortKey === "user"
        ? (a.team.name || a.team.user.name).localeCompare(b.team.name || b.team.user.name)
        : sortKey === "spend"
          ? a.totalSpend - b.totalSpend
          : a.rank - b.rank;
    return sortDir === "asc" ? cmp : -cmp;
  });
}

/** Clicking the already-active column flips its direction; clicking a
 * different column switches to it at that column's own default direction.
 * A relative `?...` href, so it works unchanged on whichever page renders
 * the sort links (admin overview or a viewer's read-only standings view).
 * Deliberately omits `page` — re-sorting always lands back on page 1. */
export function fantasySortHref(key: FantasySortKey, sortKey: FantasySortKey, sortDir: FantasySortDir): string {
  const nextDir: FantasySortDir = key === sortKey ? (sortDir === "asc" ? "desc" : "asc") : DEFAULT_DIR[key];
  const p = new URLSearchParams();
  if (key !== "rank") p.set("sort", key);
  if (nextDir !== DEFAULT_DIR[key]) p.set("dir", nextDir);
  const qs = p.toString();
  return qs ? `?${qs}` : "?";
}

/**
 * Competition ("1224") ranking: items are ordered by score descending —
 * stably, so the caller's input order breaks ties for display (fantasy teams
 * arrive in submission order) — and each item's rank is 1 + the number of
 * items with a STRICTLY greater score, so tied items share a rank and the
 * next distinct score skips ahead (1, 1, 3). Shared ranks are what keep the
 * rank-movement arrows honest: two teams on equal points can never appear to
 * overtake each other between uploads. `compare` is injected (rather than
 * assuming numbers) so callers can rank exact Decimal totals without this
 * module importing Prisma.
 */
export function assignCompetitionRanks<T, S>(
  items: T[],
  score: (item: T) => S,
  compare: (a: S, b: S) => number
): (T & { rank: number })[] {
  const scored = items.map((item) => ({ item, score: score(item) }));
  const sorted = [...scored].sort((a, b) => compare(b.score, a.score));
  const ranked: (T & { rank: number })[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const tiedWithPrevious = i > 0 && compare(sorted[i].score, sorted[i - 1].score) === 0;
    const rank = tiedWithPrevious ? ranked[i - 1].rank : i + 1;
    ranked.push({ ...sorted[i].item, rank });
  }
  return ranked;
}

export const FANTASY_STANDINGS_PAGE_SIZE = 15;

/** Parses the raw `?page=` search param into a valid, defaulted page number. */
export function resolveFantasyPage(rawPage?: string): number {
  const n = Number(rawPage);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
