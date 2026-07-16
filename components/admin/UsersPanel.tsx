import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { registerUserAction } from "@/lib/actions/auth.actions";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { NameLoginIdFields } from "@/components/admin/NameLoginIdFields";

const ROLES = ["ADMIN", "TEAM_MANAGER", "AUCTIONEER", "VIEWER"] as const;
export type RoleTab = (typeof ROLES)[number];

const ROLE_LABELS: Record<RoleTab, string> = {
  ADMIN: "Admin",
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
  const [session, allUsers] = await Promise.all([
    auth(),
    prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const counts = Object.fromEntries(
    ROLES.map((r) => [r, allUsers.filter((u) => u.role === r).length])
  ) as Record<RoleTab, number>;
  const visibleUsers = allUsers.filter((u) => u.role === activeRole);

  return (
    <div>
      <h2 className="text-lg font-medium mb-6">Users</h2>

      <details className="mb-8 rounded border border-black/10 dark:border-white/10">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Create user
        </summary>
        <form action={registerUserAction} className="flex flex-col gap-3 max-w-xl px-4 pb-4">
          <NameLoginIdFields />
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Password
              <input
                name="password"
                type="password"
                required
                className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Role
              <select
                name="role"
                required
                defaultValue={activeRole}
                className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
              >
                <option value="TEAM_MANAGER">Team manager</option>
                <option value="AUCTIONEER">Auctioneer</option>
                <option value="VIEWER">Viewer</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Manager base price (optional, only used for team managers)
            <input
              name="managerBasePrice"
              type="number"
              step="0.01"
              className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            />
          </label>
          <button
            type="submit"
            className="mt-2 self-start rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
          >
            Create user
          </button>
        </form>
      </details>

      <div className="flex gap-1 border-b border-black/10 dark:border-white/10 mb-4">
        {ROLES.map((r) => (
          <Link
            key={r}
            href={roleHref(r)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              activeRole === r
                ? "border-black dark:border-white font-medium"
                : "border-transparent text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
            }`}
          >
            {ROLE_LABELS[r]} ({counts[r]})
          </Link>
        ))}
      </div>

      {visibleUsers.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No {ROLE_LABELS[activeRole].toLowerCase()} users yet.
        </p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Login ID</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => (
              <tr key={user.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4">{user.name}</td>
                <td className="py-2 pr-4">{user.loginId}</td>
                <td className="py-2 pr-4 text-right">
                  <DeleteUserButton
                    userId={user.id}
                    userName={user.name}
                    isSelf={user.id === session?.user.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
