"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { tabsTrack, tabItem } from "@/lib/ui";

const TABS = [
  { href: "/admin/rosters", label: "Player rosters" },
  { href: "/admin/tournaments", label: "Tournaments" },
  { href: "/admin/fantasy-teams", label: "Fantasy Teams" },
  { href: "/admin/users", label: "Users" },
];

export function AdminTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Carries the sidebar's league filter (if any) across tab switches, so
  // picking a league and then switching from Rosters to Users doesn't reset it.
  const league = searchParams.get("league");
  const withLeague = (href: string) => (league ? `${href}?league=${league}` : href);

  function isActive(href: string) {
    const isFantasyTeamsPage =
      pathname.startsWith("/admin/fantasy-teams") || pathname.endsWith("/fantasy-teams");

    if (href === "/admin/fantasy-teams") {
      return isFantasyTeamsPage;
    }
    if (href === "/admin/tournaments") {
      return (
        (pathname.startsWith("/admin/tournaments") || pathname.startsWith("/admin/auctions")) &&
        !isFantasyTeamsPage
      );
    }
    return pathname.startsWith(href);
  }

  return (
    <div className={`${tabsTrack} mb-6`}>
      {TABS.map((tab) => (
        <Link key={tab.href} href={withLeague(tab.href)} className={tabItem(isActive(tab.href))}>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
