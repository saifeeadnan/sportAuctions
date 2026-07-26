"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabsTrack, tabItem } from "@/lib/ui";

export function AdminTabs({ showLeagues = false }: { showLeagues?: boolean }) {
  const pathname = usePathname();

  const tabs = [
    { href: "/admin/rosters", label: "Player rosters" },
    { href: "/admin/tournaments", label: "Tournaments" },
    { href: "/admin/fantasy-teams", label: "Fantasy Teams" },
    { href: "/admin/users", label: "Users" },
    ...(showLeagues ? [{ href: "/admin/leagues", label: "Leagues" }] : []),
  ];

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
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={tabItem(isActive(tab.href))}>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
