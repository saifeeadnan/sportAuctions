import { prisma } from "@/lib/prisma";
import { registerUserAction } from "@/lib/actions/auth.actions";

export default async function UsersPage() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Users</h1>

      <form action={registerUserAction} className="flex flex-col gap-3 mb-8 max-w-sm">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            name="name"
            required
            className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
          />
        </label>
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
            className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
          >
            <option value="TEAM_MANAGER">Team manager</option>
            <option value="AUCTIONEER">Auctioneer</option>
            <option value="VIEWER">Viewer</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
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

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-4">{user.name}</td>
              <td className="py-2 pr-4">{user.email}</td>
              <td className="py-2 pr-4">{user.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
