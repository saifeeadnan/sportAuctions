import type { Role } from "@/lib/auth/guards";

export type Section = "admin" | "manager" | "viewer" | "auctioneer";

/** Mirrors each section layout's own `requireRole(...)` call exactly
 * (`app/admin/layout.tsx`, `app/manager/layout.tsx`, `app/viewer/layout.tsx`,
 * `app/auctioneer/layout.tsx`) — kept here as one table instead of four
 * separate guards so "which sections can this session reach" can be
 * answered once, for nav purposes, without duplicating/drifting from the
 * actual access rules. `allowSiteAdmin` matches requireRole's own semantics:
 * a site Admin only satisfies a role list that explicitly includes "ADMIN". */
const SECTION_ACCESS: Record<Section, { roles: Role[]; allowSiteAdmin: boolean; href: string; label: string }> = {
  admin: { roles: ["LEAGUE_ADMIN"], allowSiteAdmin: true, href: "/admin/rosters", label: "Admin" },
  manager: { roles: ["TEAM_MANAGER"], allowSiteAdmin: false, href: "/manager", label: "Manager" },
  viewer: { roles: ["VIEWER", "TEAM_MANAGER"], allowSiteAdmin: false, href: "/viewer", label: "Watch auctions" },
  auctioneer: {
    roles: ["AUCTIONEER", "LEAGUE_ADMIN"],
    allowSiteAdmin: true,
    href: "/auctioneer",
    label: "Auctioneer",
  },
};

/** Every section this session is authorized to reach, across ALL of the
 * user's league memberships combined — a user can hold different roles in
 * different leagues (e.g. TEAM_MANAGER in League A, VIEWER in League B),
 * and each section's own guard already allows that (see the layouts this
 * table mirrors); this just makes that reachability visible for nav. */
export function accessibleSections(session: {
  user: { isSiteAdmin: boolean; memberships: { role: string }[] };
}): Section[] {
  const roleSet = new Set(session.user.memberships.map((m) => m.role));
  return (Object.keys(SECTION_ACCESS) as Section[]).filter((section) => {
    const { roles, allowSiteAdmin } = SECTION_ACCESS[section];
    if (allowSiteAdmin && session.user.isSiteAdmin) return true;
    return roles.some((r) => roleSet.has(r));
  });
}

export function sectionHref(section: Section): string {
  return SECTION_ACCESS[section].href;
}

export function sectionLabel(section: Section): string {
  return SECTION_ACCESS[section].label;
}
