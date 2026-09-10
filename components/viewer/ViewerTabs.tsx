"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabsTrack, tabItem } from "@/lib/ui";

const TABS = [
  { href: "/viewer", label: "Watch auctions" },
  { href: "/viewer/fantasy", label: "Fantasy teams" },
  { href: "/viewer/rate", label: "Rate players" },
];

export function ViewerTabs() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/viewer/fantasy") return pathname.startsWith("/viewer/fantasy");
    if (href === "/viewer/rate") return pathname.startsWith("/viewer/rate");
    return (
      pathname.startsWith("/viewer") &&
      !pathname.startsWith("/viewer/fantasy") &&
      !pathname.startsWith("/viewer/rate")
    );
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
