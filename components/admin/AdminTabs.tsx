"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabsTrack, tabItem } from "@/lib/ui";

export function AdminTabs() {
  const pathname = usePathname();

  const tabs = [
    { href: "/admin/rosters", label: "Player rosters" },
    { href: "/admin/tournaments", label: "Tournaments" },
    { href: "/admin/users", label: "Users" },
  ];

  function isActive(href: string) {
    if (href === "/admin/tournaments") {
      return pathname.startsWith("/admin/tournaments") || pathname.startsWith("/admin/auctions");
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
