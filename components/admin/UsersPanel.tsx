import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { listLeagues, isLeagueReadOnly } from "@/lib/services/league.service";
import { registerUserAction, addExistingPersonAction } from "@/lib/actions/auth.actions";
import { ActionResultForm } from "@/components/ui/ActionResultForm";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { DeleteMembershipButton } from "@/components/admin/DeleteMembershipButton";
import { ResetPasswordButton } from "@/components/admin/ResetPasswordButton";
import { EditProfileButton } from "@/components/admin/EditProfileButton";
import { ToggleUserActiveButton } from "@/components/admin/ToggleUserActiveButton";
import { ToggleMembershipActiveButton } from "@/components/admin/ToggleMembershipActiveButton";
import { NameLoginIdFields } from "@/components/admin/NameLoginIdFields";
import { card, buttonPrimary, inputClass, selectClass, tabsTrack, tabItem } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

const ROLES = ["ADMIN", "LEAGUE_ADMIN", "TEAM_MANAGER", "AUCTIONEER", "VIEWER"] as const;
export type RoleTab = (typeof ROLES)[number];

const ROLE_LABELS: Record<RoleTab, string> = {
  ADMIN: "Admin",
  LEAGUE_ADMIN: "League admin",
  TEAM_MANAGER: "Team manager",
  AUCTIONEER: "Auctioneer",
  VIEWER: "Viewer",
};

export function resolveRoleTab(role?: string): RoleTab {
  return ROLES.includes(role as RoleTab) ? (role as RoleTab) : "ADMIN";
}

export async function UsersPanel({
  activeRole,
  roleHref,
  selectedLeagueId,
}: {
  activeRole: RoleTab;
  roleHref: (role: RoleTab) => string;
  selectedLeagueId?: string;
}) {
  const { session, leagueIds: realLeagueIds } = await requireAdminOrLeagueAdmin();
  const isSiteAdmin = realLeagueIds === null;
  // The sidebar's league filter is a display convenience for a site Admin's
  // (unrestricted) view, or narrows a multi-league League Admin to one of
  // their own — it must never be confused with the caller's actual
  // authorization scope, which is what gates role creation/visibility below.
  const displayLeagueIds = isSiteAdmin
    ? selectedLeagueId
      ? [selectedLeagueId]
      : null
    : selectedLeagueId && realLeagueIds.includes(selectedLeagueId)
      ? [selectedLeagueId]
      : realLeagueIds;
  // A single, definite leagueId for the "my league" banner/read-only check
  // and the create-forms' implicit league — only meaningful once scope has
  // narrowed to exactly one league.
  const displayLeagueId = displayLeagueIds?.length === 1 ? displayLeagueIds[0] : undefined;

  // A League Admin can only see/manage their own league's people, and can
  // never grant or view the Admin role — that's a site-wide identity flag,
  // not something scoped to any one league.
  const visibleRoleTabs: RoleTab[] = isSiteAdmin ? [...ROLES] : ROLES.filter((r) => r !== "ADMIN");
  const creatableRoles: RoleTab[] = isSiteAdmin
    ? [...ROLES]
    : ROLES.filter((r) => r !== "ADMIN" && r !== "LEAGUE_ADMIN");

  const [adminUsers, membershipRows, leagues, myLeague] = await Promise.all([
    // Admin accounts aren't scoped to any league, so the sidebar's league
    // filter never narrows this — only whether the caller can see the tab
    // at all (isSiteAdmin) matters.
    isSiteAdmin
      ? prisma.user.findMany({ where: { isSiteAdmin: true }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    prisma.leagueMembership.findMany({
      where: displayLeagueIds ? { leagueId: { in: displayLeagueIds } } : {},
      include: { user: true, league: { select: { name: true, endDate: true } } },
      orderBy: { createdAt: "desc" },
    }),
    isSiteAdmin ? listLeagues() : Promise.resolve(null),
    displayLeagueId
      ? prisma.league.findUnique({ where: { id: displayLeagueId }, select: { endDate: true } })
      : Promise.resolve(null),
  ]);

  // A League Admin has no league picker (always their own fixed league), so
  // if it's read-only the whole "add a user" section is blocked outright. A
  // site ADMIN instead sees read-only leagues marked (not removed) in the
  // pickers below.
  const myLeagueReadOnly = myLeague != null && isLeagueReadOnly(myLeague);

  const counts: Record<RoleTab, number> = {
    ADMIN: adminUsers.length,
    LEAGUE_ADMIN: membershipRows.filter((m) => m.role === "LEAGUE_ADMIN").length,
    TEAM_MANAGER: membershipRows.filter((m) => m.role === "TEAM_MANAGER").length,
    AUCTIONEER: membershipRows.filter((m) => m.role === "AUCTIONEER").length,
    VIEWER: membershipRows.filter((m) => m.role === "VIEWER").length,
  };
  const effectiveActiveRole = visibleRoleTabs.includes(activeRole) ? activeRole : visibleRoleTabs[0];
  const visibleMemberships = membershipRows.filter((m) => m.role === effectiveActiveRole);
  // Shown only when a row's league isn't already implied by the page's own
  // scope (a single fixed league) — a site Admin viewing "all leagues" or a
  // multi-league League Admin needs it to tell rows apart.
  const showLeagueColumn = displayLeagueIds === null || displayLeagueIds.length > 1;

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Users</h2>

      {myLeagueReadOnly ? (
        <div className={`${card} mb-6 px-4 py-3 text-sm text-black/60 dark:text-white/60`}>
          Add a user — this league is read-only.
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          <details className={card}>
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              Create new person
            </summary>
            <ActionResultForm action={registerUserAction} className="flex flex-col gap-3 max-w-xl px-4 pb-4">
              <NameLoginIdFields />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Password
                  <input name="password" type="password" required className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Role
                  <select
                    name="role"
                    required
                    defaultValue={creatableRoles.includes(activeRole) ? activeRole : creatableRoles[0]}
                    className={selectClass}
                  >
                    {creatableRoles
                      .filter((r) => r !== "ADMIN")
                      .map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    {creatableRoles.includes("ADMIN") && <option value="ADMIN">Admin</option>}
                  </select>
                </label>
              </div>
              {leagues && (
                <label className="flex flex-col gap-1 text-sm">
                  League (not used for Admin accounts)
                  <select
                    name="leagueId"
                    className={selectClass}
                    defaultValue={displayLeagueId ?? leagues[0]?.id ?? ""}
                  >
                    {leagues.length === 0 && <option value="">— No leagues yet —</option>}
                    {leagues.map((l) => (
                      <option key={l.id} value={l.id} disabled={isLeagueReadOnly(l)}>
                        {l.name}
                        {isLeagueReadOnly(l) ? " (read-only)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm">
                Manager base price (optional, only used for team managers)
                <input name="managerBasePrice" type="number" step="0.01" className={inputClass} />
              </label>
              <button type="submit" className={`${buttonPrimary} mt-2 self-start`}>
                Create person
              </button>
            </ActionResultForm>
          </details>

          <details className={card}>
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              Add existing person
            </summary>
            <ActionResultForm
              action={addExistingPersonAction}
              className="flex flex-col gap-3 max-w-xl px-4 pb-4"
            >
              <label className="flex flex-col gap-1 text-sm">
                Login ID, email, or phone
                <input name="identifier" type="text" required className={inputClass} />
                <span className="text-xs text-black/50 dark:text-white/50">
                  For someone who already has a login from another league — adds this league to
                  their existing account instead of creating a second one.
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Role
                <select
                  name="role"
                  required
                  defaultValue={
                    activeRole !== "ADMIN" && creatableRoles.includes(activeRole) ? activeRole : "VIEWER"
                  }
                  className={selectClass}
                >
                  {creatableRoles
                    .filter((r) => r !== "ADMIN")
                    .map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                </select>
              </label>
              {leagues && (
                <label className="flex flex-col gap-1 text-sm">
                  League
                  <select
                    name="leagueId"
                    className={selectClass}
                    defaultValue={displayLeagueId ?? leagues[0]?.id ?? ""}
                  >
                    {leagues.length === 0 && <option value="">— No leagues yet —</option>}
                    {leagues.map((l) => (
                      <option key={l.id} value={l.id} disabled={isLeagueReadOnly(l)}>
                        {l.name}
                        {isLeagueReadOnly(l) ? " (read-only)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="submit" className={`${buttonPrimary} mt-2 self-start`}>
                Add to league
              </button>
            </ActionResultForm>
          </details>
        </div>
      )}

      <div className={`${tabsTrack} mb-4`}>
        {visibleRoleTabs.map((r) => (
          <Link key={r} href={roleHref(r)} className={tabItem(effectiveActiveRole === r)}>
            {ROLE_LABELS[r]} ({counts[r]})
          </Link>
        ))}
      </div>

      {effectiveActiveRole === "ADMIN" ? (
        adminUsers.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No admin users yet.</p>
        ) : (
          <div className={card}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pl-4 pr-4">Name</th>
                  <th className="py-2 pr-4">Login ID</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((user) => (
                  <tr key={user.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-2 pl-4 pr-4">
                      <div className="flex items-center gap-2">
                        {user.name}
                        {!user.isActive && <Badge variant="danger">Disabled</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <EditProfileButton
                        userId={user.id}
                        loginId={user.loginId}
                        email={user.email}
                        phone={user.phone}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center justify-end gap-3">
                        <ToggleUserActiveButton
                          userId={user.id}
                          userName={user.name}
                          isActive={user.isActive}
                          isSelf={user.id === session.user.id}
                        />
                        <ResetPasswordButton userId={user.id} />
                        <DeleteUserButton
                          userId={user.id}
                          userName={user.name}
                          isSelf={user.id === session.user.id}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : visibleMemberships.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No {ROLE_LABELS[effectiveActiveRole].toLowerCase()} users yet.
        </p>
      ) : (
        <div className={card}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pl-4 pr-4">Name</th>
                <th className="py-2 pr-4">Login ID</th>
                {showLeagueColumn && <th className="py-2 pr-4">League</th>}
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {visibleMemberships.map((m) => (
                <tr key={m.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                  <td className="py-2 pl-4 pr-4">
                    <div className="flex items-center gap-2">
                      {m.user.name}
                      {!m.isActive && <Badge variant="warning">Pending</Badge>}
                      {!m.user.isActive && <Badge variant="danger">Disabled</Badge>}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <EditProfileButton
                      userId={m.userId}
                      loginId={m.user.loginId}
                      email={m.user.email}
                      phone={m.user.phone}
                    />
                  </td>
                  {showLeagueColumn && (
                    <td className="py-2 pr-4 text-black/60 dark:text-white/60">{m.league.name}</td>
                  )}
                  <td className="py-2 pr-4">
                    <div className="flex items-center justify-end gap-3">
                      <ToggleMembershipActiveButton
                        membershipId={m.id}
                        userName={m.user.name}
                        isActive={m.isActive}
                        isSelf={m.userId === session.user.id}
                      />
                      {isSiteAdmin && (
                        <>
                          <ToggleUserActiveButton
                            userId={m.userId}
                            userName={m.user.name}
                            isActive={m.user.isActive}
                            isSelf={m.userId === session.user.id}
                          />
                          <ResetPasswordButton userId={m.userId} />
                          <DeleteMembershipButton
                            membershipId={m.id}
                            userName={m.user.name}
                            isSelf={m.userId === session.user.id}
                            readOnly={isLeagueReadOnly(m.league)}
                          />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
