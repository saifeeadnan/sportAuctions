"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabsTrack, tabItem } from "@/lib/ui";

const TABS = [
  { href: "/manager", label: "Tournaments" },
  { href: "/manager/fantasy", label: "Fantasy teams" },
  { href: "/manager/rate", label: "Rate players" },
];

export function ManagerTabs() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/manager/fantasy") return pathname.startsWith("/manager/fantasy");
    if (href === "/manager/rate") return pathname.startsWith("/manager/rate");
    return (
      pathname.startsWith("/manager") &&
      !pathname.startsWith("/manager/fantasy") &&
      !pathname.startsWith("/manager/rate")
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
