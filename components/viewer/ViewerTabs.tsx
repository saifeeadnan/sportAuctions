"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabsTrack, tabItem } from "@/lib/ui";

const TABS = [
  { href: "/viewer", label: "Watch auctions" },
  { href: "/viewer/fantasy", label: "Fantasy teams" },
];

export function ViewerTabs() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/viewer/fantasy") return pathname.startsWith("/viewer/fantasy");
    return pathname.startsWith("/viewer") && !pathname.startsWith("/viewer/fantasy");
  }

  return (
    <div className={`${tabsTrack} mb-6`}>
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={tabItem(isActive(tab.href))}>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
