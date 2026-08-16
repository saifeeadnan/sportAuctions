import { requireSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { changePasswordAction, updateProfileAction } from "@/lib/actions/auth.actions";
import { card, buttonPrimary, inputClass } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

const ERROR_MESSAGES: Record<string, string> = {
  "missing-fields": "All fields are required.",
  short: "New password must be at least 8 characters.",
  mismatch: "New passwords do not match.",
  "wrong-current": "Current password is incorrect.",
  system: "Something went wrong — please try again in a moment.",
};

const PROFILE_ERROR_MESSAGES: Record<string, string> = {
  "email-taken": "That email is already in use by another account.",
  "phone-taken": "That phone number is already in use by another account.",
  system: "Something went wrong — please try again in a moment.",
};

const ROLE_LABELS: Record<string, string> = {
  LEAGUE_ADMIN: "League admin",
  TEAM_MANAGER: "Team manager",
  AUCTIONEER: "Auctioneer",
  VIEWER: "Viewer",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; profileError?: string; profileSuccess?: string }>;
}) {
  const session = await requireSession();
  const { error, success, profileError, profileSuccess } = await searchParams;
  const roleSummary = session.user.isSiteAdmin
    ? "Site Admin"
    : session.user.memberships.map((m) => m.role).join(", ") || "No league memberships";

  const [account, memberships] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { email: true, phone: true },
    }),
    session.user.isSiteAdmin
      ? Promise.resolve([])
      : prisma.leagueMembership.findMany({
          where: { userId: session.user.id },
          include: { league: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        }),
  ]);

  return (
    <div className="mx-auto max-w-sm px-4 py-16 flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium mb-1">Profile</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          {session.user.name} &middot; {roleSummary}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <details className={card}>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            Update profile
          </summary>
          <div className="px-4 pb-4">
            {profileError && (
              <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                {PROFILE_ERROR_MESSAGES[profileError] ?? "Something went wrong."}
              </p>
            )}
            {profileSuccess && (
              <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">
                Contact info updated.
              </p>
            )}
            <form action={updateProfileAction} className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Email (optional)
                  <input
                    name="email"
                    type="email"
                    defaultValue={account.email ?? ""}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Phone (optional)
                  <input
                    name="phone"
                    type="tel"
                    defaultValue={account.phone ?? ""}
                    className={inputClass}
                  />
                </label>
              </div>
              <p className="text-xs text-black/50 dark:text-white/50">
                Helps a league admin find and re-associate your login if you ever need to join
                another league without registering again.
              </p>
              <button type="submit" className={`${buttonPrimary} mt-2 self-start`}>
                Save
              </button>
            </form>
          </div>
        </details>

        <details className={card}>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            Change password
          </summary>
          <div className="px-4 pb-4">
            {error && (
              <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                {ERROR_MESSAGES[error] ?? "Something went wrong."}
              </p>
            )}
            {success && (
              <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">
                Password changed successfully.
              </p>
            )}
            <form action={changePasswordAction} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Current password
                <input name="currentPassword" type="password" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                New password
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Confirm new password
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  className={inputClass}
                />
              </label>
              <button type="submit" className={`${buttonPrimary} mt-2 self-start`}>
                Change password
              </button>
            </form>
          </div>
        </details>
      </div>

      {!session.user.isSiteAdmin && (
        <div className={`${card} p-6`}>
          <h2 className="text-lg font-semibold mb-4">Your leagues</h2>
          {memberships.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              You're not part of any league yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {m.league.name}{" "}
                    <span className="text-black/50 dark:text-white/50">
                      &middot; {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </span>
                  {!m.isActive && <Badge variant="warning">Pending approval</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
