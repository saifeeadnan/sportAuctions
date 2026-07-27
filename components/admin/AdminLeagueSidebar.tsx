"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { card } from "@/lib/ui";

type League = { id: string; name: string; type: string };

export function AdminLeagueSidebar({ leagues }: { leagues: League[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedLeagueId = searchParams.get("league");

  function hrefFor(leagueId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (leagueId) {
      params.set("league", leagueId);
    } else {
      params.delete("league");
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const itemClass = (active: boolean) =>
    `block rounded-md px-3 py-1.5 text-sm transition-colors ${
      active
        ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-medium"
        : "text-black/70 dark:text-white/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
    }`;

  const links = (
    <div className="flex flex-col gap-0.5">
      <Link href={hrefFor(null)} className={itemClass(!selectedLeagueId)}>
        All leagues
      </Link>
      {leagues.map((league) => (
        <Link
          key={league.id}
          href={hrefFor(league.id)}
          className={itemClass(selectedLeagueId === league.id)}
        >
          {league.name}
        </Link>
      ))}
    </div>
  );

  return (
    <>
      {/* Narrow screens: a collapsible dropdown instead of a permanent column,
          so it doesn't push the actual content far down the page. */}
      <details className={`${card} sm:hidden mb-4 p-3`}>
        <summary className="cursor-pointer select-none px-1 py-1 text-sm font-medium">
          Leagues
        </summary>
        <div className="mt-2">{links}</div>
      </details>

      <nav className={`${card} hidden sm:block w-56 shrink-0 self-start p-3`}>
        <Link
          href="/admin/leagues"
          className="block px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
        >
          Leagues
        </Link>
        {links}
      </nav>
    </>
  );
}
