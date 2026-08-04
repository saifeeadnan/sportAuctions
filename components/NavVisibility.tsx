"use client";

import { usePathname } from "next/navigation";

// The analytics dashboard opens in its own popup window and is meant to fill
// it edge to edge (see AnalyticsDashboardPage.tsx's `fixed inset-0`) — but
// that only visually covers app/manager/layout.tsx's content column, not the
// root layout's <Nav>, which sits in a stacking context above it (Nav's
// explicit z-10 vs. the dashboard's unset z-index) and stays clickable. A
// manager mid-auction shouldn't be able to reach Sign out from what's
// supposed to be a dedicated live tool window, so it's hidden here instead.
const HIDDEN_ON = [/^\/manager\/teams\/[^/]+\/analytics(\/|$)/];

export function NavVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (HIDDEN_ON.some((re) => re.test(pathname))) return null;
  return <>{children}</>;
}
