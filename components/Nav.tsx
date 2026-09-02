import Link from "next/link";
import { auth } from "@/auth";
import { logoutAction } from "@/lib/actions/auth.actions";
import { buttonSecondary } from "@/lib/ui";
import { LogoMark } from "@/components/ui/LogoMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NavVisibility } from "@/components/NavVisibility";

export async function Nav() {
  const session = await auth();

  return (
    <NavVisibility>
      <header className="border-b border-black/[0.08] dark:border-white/10 bg-white/80 dark:bg-black/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-[#1B2430] dark:text-white">
            <LogoMark className="h-6 w-6" />
            <span>LeagueForge</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 text-sm">
            <ThemeToggle />
            {session?.user ? (
              <>
                <Link
                  href="/profile"
                  className="flex items-center gap-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
                >
                  <span className="hidden sm:inline truncate max-w-[10rem]">{session.user.name}</span>
                </Link>
                <form action={logoutAction}>
                  <button type="submit" className={`${buttonSecondary} px-3 py-1.5 text-xs`}>
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login" className={`${buttonSecondary} px-3 py-1.5 text-xs`}>
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>
    </NavVisibility>
  );
}
