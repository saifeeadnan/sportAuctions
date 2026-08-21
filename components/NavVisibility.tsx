"use client";

import { usePathname } from "next/navigation";

// Both analytics dashboards (v1 and v2) open in their own popup window and
// are meant to fill it edge to edge (see AnalyticsDashboardPage.tsx and
// AnalyticsV2Dashboard.tsx's `fixed inset-0`) — but that only visually
// covers app/manager/layout.tsx's content column, not the root layout's
// <Nav>, which sits in a stacking context above it (Nav's explicit z-10 vs.
// the dashboard's unset z-index) and stays clickable. A manager mid-auction
// shouldn't be able to reach Sign out from what's supposed to be a
// dedicated live tool window, so it's hidden here instead. The auctioneer's
// broadcast view (an OBS browser-source canvas) reuses the same treatment —
// a stream must never show the app's nav chrome or a Sign out button.
const HIDDEN_ON = [
  /^\/manager\/teams\/[^/]+\/analytics(-v2)?(\/|$)/,
  /^\/auctioneer\/auctions\/[^/]+\/broadcast(\/|$)/,
];

export function NavVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (HIDDEN_ON.some((re) => re.test(pathname))) return null;
  return <>{children}</>;
}
