import { requireSession } from "@/lib/auth/guards";
import { changePasswordAction } from "@/lib/actions/auth.actions";
import { card, buttonPrimary, inputClass } from "@/lib/ui";

const ERROR_MESSAGES: Record<string, string> = {
  "missing-fields": "All fields are required.",
  short: "New password must be at least 8 characters.",
  mismatch: "New passwords do not match.",
  "wrong-current": "Current password is incorrect.",
  system: "Something went wrong — please try again in a moment.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await requireSession();
  const { error, success } = await searchParams;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold mb-1">Profile</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        {session.user.name} &middot; {session.user.role}
      </p>

      <div className={`${card} p-6`}>
        <h2 className="text-lg font-semibold mb-6">Change password</h2>
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
            <input name="newPassword" type="password" required minLength={8} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Confirm new password
            <input name="confirmPassword" type="password" required minLength={8} className={inputClass} />
          </label>
          <button type="submit" className={`${buttonPrimary} mt-2`}>
            Change password
          </button>
        </form>
      </div>
    </div>
  );
}
