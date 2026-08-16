import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkLoginIdAction, registerSelfAction, joinLeagueWithExistingLoginAction } from "./actions";
import { card, buttonPrimary, inputClass } from "@/lib/ui";
import { LogoMark } from "@/components/ui/LogoMark";
import { PoweredByBytzSport } from "@/components/ui/PoweredByBytzSport";

const ERROR_MESSAGES: Record<string, string> = {
  "missing-login-id": "Login ID is required.",
  "missing-fields": "Password is required.",
  "short-password": "Password must be at least 8 characters.",
  "password-mismatch": "Passwords do not match.",
  "invalid-league": "This registration link is invalid — ask your league admin for a new one.",
  "already-registered": "An account already exists for this Login ID. Contact your league admin if you can't log in.",
  "player-not-found":
    "We couldn't find a player with that Login ID on this league's roster. Check with your league admin.",
  "account-not-found": "We couldn't find an account for that Login ID. Try again or start over.",
  "wrong-password": "That password doesn't match this Login ID's account.",
  "already-member": "This account is already registered for this league.",
  "account-disabled":
    "This account isn't active yet — it needs to be approved for its first league before it can join another.",
  system: "Something went wrong — please try again in a moment.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; loginId?: string; mode?: string; error?: string; success?: string }>;
}) {
  const { league: leagueId, loginId, mode, error, success } = await searchParams;
  const league = leagueId ? await prisma.league.findUnique({ where: { id: leagueId } }) : null;
  const startOverHref = `/register?league=${leagueId ?? ""}`;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <LogoMark className="h-10 w-10 mx-auto mb-3 text-black dark:text-white" />
      <p className="text-center font-semibold tracking-tight mb-1">LeagueForge</p>
      <div className="flex justify-center mb-6">
        <PoweredByBytzSport />
      </div>
      <div className={`${card} p-6`}>
        <h1 className="text-xl font-semibold mb-1">
          {mode === "existing" ? "Join with your existing login" : "Create your account"}
        </h1>

        {!league ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            This registration link is invalid — ask your league admin for a new one.
          </p>
        ) : (
          <>
            <p className="text-sm text-black/60 dark:text-white/60 mb-6">
              Joining <span className="font-medium">{league.name}</span>
            </p>

            {error && (
              <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                {ERROR_MESSAGES[error] ?? "Something went wrong."}
              </p>
            )}

            {success ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                You're all set — this league has been added and is pending approval from its
                admin. You'll be able to{" "}
                <Link href="/login" className="underline underline-offset-2">
                  log in
                </Link>{" "}
                (or see it appear) once it's approved.
              </p>
            ) : mode === "new" && loginId ? (
              <form action={registerSelfAction} className="flex flex-col gap-3">
                <input type="hidden" name="leagueId" value={league.id} />
                <input type="hidden" name="loginId" value={loginId} />
                <p className="text-xs text-black/50 dark:text-white/50">
                  Login ID: <span className="font-medium">{loginId}</span> —{" "}
                  <Link href={startOverHref} className="underline underline-offset-2">
                    not you?
                  </Link>
                </p>
                <label className="flex flex-col gap-1 text-sm">
                  Password
                  <input name="password" type="password" required minLength={8} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Confirm password
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    className={inputClass}
                  />
                </label>
                <button type="submit" className={`${buttonPrimary} mt-2`}>
                  Create account
                </button>
              </form>
            ) : mode === "existing" && loginId ? (
              <form action={joinLeagueWithExistingLoginAction} className="flex flex-col gap-3">
                <input type="hidden" name="leagueId" value={league.id} />
                <input type="hidden" name="loginId" value={loginId} />
                <p className="text-xs text-black/50 dark:text-white/50">
                  We found an existing account for <span className="font-medium">{loginId}</span>.
                  Enter its password to add this league to it —{" "}
                  <Link href={startOverHref} className="underline underline-offset-2">
                    not you?
                  </Link>
                </p>
                <label className="flex flex-col gap-1 text-sm">
                  Password
                  <input name="password" type="password" required className={inputClass} />
                </label>
                <button type="submit" className={`${buttonPrimary} mt-2`}>
                  Join {league.name}
                </button>
              </form>
            ) : (
              <form action={checkLoginIdAction} className="flex flex-col gap-3">
                <input type="hidden" name="leagueId" value={league.id} />
                <label className="flex flex-col gap-1 text-sm">
                  Login ID
                  <input name="loginId" type="text" required className={inputClass} />
                  <span className="text-xs text-black/50 dark:text-white/50">
                    The Login ID your name was uploaded under on this league's roster. Already
                    registered for another league? Use that same Login ID here.
                  </span>
                </label>
                <button type="submit" className={`${buttonPrimary} mt-2`}>
                  Continue
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
