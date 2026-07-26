import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { listLeagues } from "@/lib/services/league.service";
import { registerUserAction } from "@/lib/actions/auth.actions";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { NameLoginIdFields } from "@/components/admin/NameLoginIdFields";
import { card, buttonPrimary, inputClass, tabsTrack, tabItem } from "@/lib/ui";

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
}: {
  activeRole: RoleTab;
  roleHref: (role: RoleTab) => string;
}) {
  const { session, leagueId } = await requireAdminOrLeagueAdmin();

  // A League Admin can only see/manage their own league's users, and can never
  // create or view another Admin or League Admin account.
  const visibleRoleTabs: RoleTab[] =
    leagueId === null ? [...ROLES] : ROLES.filter((r) => r !== "ADMIN" && r !== "LEAGUE_ADMIN");
  const creatableRoles: RoleTab[] =
    leagueId === null ? [...ROLES] : ROLES.filter((r) => r !== "ADMIN" && r !== "LEAGUE_ADMIN");

  const [allUsers, leagues] = await Promise.all([
    prisma.user.findMany({ where: leagueId ? { leagueId } : {}, orderBy: { createdAt: "desc" } }),
    leagueId ? Promise.resolve(null) : listLeagues(),
  ]);

  const counts = Object.fromEntries(
    ROLES.map((r) => [r, allUsers.filter((u) => u.role === r).length])
  ) as Record<RoleTab, number>;
  const effectiveActiveRole = visibleRoleTabs.includes(activeRole) ? activeRole : visibleRoleTabs[0];
  const visibleUsers = allUsers.filter((u) => u.role === effectiveActiveRole);

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Users</h2>

      <details className={`${card} mb-6`}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Create user
        </summary>
        <form action={registerUserAction} className="flex flex-col gap-3 max-w-xl px-4 pb-4">
          <NameLoginIdFields />
          <div className="grid grid-cols-2 gap-3">
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
                className={inputClass}
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
              <select name="leagueId" className={inputClass} defaultValue={leagues[0]?.id ?? ""}>
                {leagues.length === 0 && <option value="">— No leagues yet —</option>}
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
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
            Create user
          </button>
        </form>
      </details>

      <div className={`${tabsTrack} mb-4`}>
        {visibleRoleTabs.map((r) => (
          <Link key={r} href={roleHref(r)} className={tabItem(effectiveActiveRole === r)}>
            {ROLE_LABELS[r]} ({counts[r]})
          </Link>
        ))}
      </div>

      {visibleUsers.length === 0 ? (
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
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                  <td className="py-2 pl-4 pr-4">{user.name}</td>
                  <td className="py-2 pr-4">{user.loginId}</td>
                  <td className="py-2 pr-4 text-right">
                    <DeleteUserButton
                      userId={user.id}
                      userName={user.name}
                      isSelf={user.id === session.user.id}
                    />
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
