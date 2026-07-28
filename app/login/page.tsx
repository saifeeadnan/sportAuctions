import { loginAction } from "./actions";
import { card, buttonPrimary, inputClass } from "@/lib/ui";
import { LogoMark } from "@/components/ui/LogoMark";
import { PoweredByBytzSport } from "@/components/ui/PoweredByBytzSport";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <LogoMark className="h-10 w-10 mx-auto mb-3 text-black dark:text-white" />
      <p className="text-center font-semibold tracking-tight mb-1">LeagueForge</p>
      <div className="flex justify-center mb-6">
        <PoweredByBytzSport />
      </div>
      <div className={`${card} p-6`}>
        <h1 className="text-xl font-semibold mb-6">Log in</h1>
        {error === "invalid" && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            Invalid login ID or password.
          </p>
        )}
        {error === "system" && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            Something went wrong while checking your credentials — this usually means the
            database is temporarily unavailable. Please try again in a moment.
          </p>
        )}
        <form action={loginAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Login ID
            <input name="loginId" type="text" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input name="password" type="password" required className={inputClass} />
          </label>
          <button type="submit" className={`${buttonPrimary} mt-2`}>
            Log in
          </button>
        </form>
      </div>
    </div>
  );
}
