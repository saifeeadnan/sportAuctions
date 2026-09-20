import { requireSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { changePasswordAction, updateProfileAction } from "@/lib/actions/auth.actions";
import {
  linkPlayerPhotoToProfileAction,
  linkSelectedPlayerPhotosToProfileAction,
} from "@/lib/actions/playerPhoto.actions";
import { listMyPlayerRows } from "@/lib/services/playerPhoto.service";
import { ProfilePhotoForm } from "@/components/ProfilePhotoForm";
import { RemoveProfilePhotoButton } from "@/components/RemoveProfilePhotoButton";
import { ActionResultForm } from "@/components/ui/ActionResultForm";
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

  const [account, memberships, myPlayers] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { email: true, phone: true, photoUrl: true, photoMimeType: true },
    }),
    session.user.isSiteAdmin
      ? Promise.resolve([])
      : prisma.leagueMembership.findMany({
          where: { userId: session.user.id },
          include: { league: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        }),
    listMyPlayerRows(session.user.id),
  ]);
  const hasProfilePhoto = !!(account.photoUrl || account.photoMimeType);

  const photoSrc = account.photoUrl ?? (account.photoMimeType ? `/api/users/${session.user.id}/photo` : null);

  return (
    <div className="mx-auto max-w-sm px-4 py-16 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt={session.user.name ?? ""}
            className="h-[84px] w-[84px] rounded-full object-cover bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 shrink-0"
          />
        ) : (
          <div className="h-[84px] w-[84px] rounded-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 flex items-center justify-center text-lg font-medium text-black/40 dark:text-white/40 shrink-0">
            {(session.user.name ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h2 className="text-lg font-medium mb-1">Profile</h2>
          <p className="text-sm text-black/60 dark:text-white/60">
            {session.user.name} &middot; {roleSummary}
          </p>
        </div>
      </div>

      <section>
        <h3 className="text-sm font-medium mb-2">Profile picture</h3>
        <div className={`${card} px-4 py-3 flex items-center justify-between gap-4 flex-wrap mb-3`}>
          {photoSrc ? (
            <>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc}
                  alt={session.user.name ?? ""}
                  className="h-24 w-24 rounded-full object-cover bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1"
                />
              </div>
              <RemoveProfilePhotoButton
                actionUrl={`/api/users/${session.user.id}/photo`}
                confirmMessage="Remove your profile picture?"
              />
            </>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">No profile picture set yet.</p>
          )}
        </div>
        <details className={card}>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            {photoSrc ? "Replace profile picture" : "Upload profile picture"}
          </summary>
          <div className="px-4 pb-4">
            <ProfilePhotoForm actionUrl={`/api/users/${session.user.id}/photo`} />
          </div>
        </details>
      </section>

      {myPlayers.length > 0 && (
        <section>
          <h3 className="text-sm font-medium mb-2">Your roster photos</h3>
          <div className="flex flex-col gap-3">
            {myPlayers.map((player) => {
              const isLinked = player.linkedUserId === session.user.id;
              const status = isLinked ? "Linked to your profile" : player.photoUrl ? "Custom photo" : "No photo";
              return (
                <div key={player.id} className={`${card} p-3 flex flex-col gap-3`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      {player.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={player.photoUrl}
                          alt={player.name}
                          className="h-14 w-14 rounded-full object-cover bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1 shrink-0"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 flex items-center justify-center text-sm font-medium text-black/40 dark:text-white/40 shrink-0">
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium">{player.name}</p>
                        <p className="text-xs text-black/50 dark:text-white/50">
                          {player.leagueName} &middot; {player.rosterName}
                        </p>
                      </div>
                    </div>
                    <Badge variant={isLinked ? "success" : player.photoUrl ? "info" : "neutral"}>
                      {status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {hasProfilePhoto && !isLinked && (
                      <ActionResultForm action={linkPlayerPhotoToProfileAction.bind(null, player.id)}>
                        <button type="submit" className={buttonPrimary}>
                          Link to my profile photo
                        </button>
                      </ActionResultForm>
                    )}
                    {player.photoUrl && (
                      <RemoveProfilePhotoButton
                        actionUrl={`/api/players/${player.id}/photo`}
                        confirmMessage="Remove this roster photo?"
                      />
                    )}
                  </div>
                  <details className={card}>
                    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                      {player.photoUrl ? "Upload a different photo" : "Upload a photo"}
                    </summary>
                    <div className="px-4 pb-4">
                      <ProfilePhotoForm actionUrl={`/api/players/${player.id}/photo`} />
                    </div>
                  </details>
                </div>
              );
            })}
          </div>

          {hasProfilePhoto && myPlayers.length >= 2 && (
            <details className={`${card} mt-3`}>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                Apply my profile photo to multiple rosters at once
              </summary>
              <div className="px-4 pb-4">
                <ActionResultForm
                  action={linkSelectedPlayerPhotosToProfileAction}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-2">
                    {myPlayers.map((player) => (
                      <label key={player.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="playerIds" value={player.id} />
                        {player.name}{" "}
                        <span className="text-black/50 dark:text-white/50">
                          ({player.leagueName} &middot; {player.rosterName})
                        </span>
                      </label>
                    ))}
                  </div>
                  <button type="submit" className={`${buttonPrimary} self-start`}>
                    Link selected to my profile photo
                  </button>
                </ActionResultForm>
              </div>
            </details>
          )}

          {hasProfilePhoto && (
            <p className="text-xs text-black/50 dark:text-white/50 mt-2">
              A roster photo linked to your profile is visible to anyone with a link to that roster
              or its highlights — no login required.
            </p>
          )}
        </section>
      )}

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
