import Link from "next/link";
import { auth } from "@/auth";
import { logoutAction } from "@/lib/actions/auth.actions";
import { buttonSecondary } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export async function Nav() {
  const session = await auth();

  return (
    <header className="border-b border-black/[0.08] dark:border-white/10 bg-white/80 dark:bg-black/40 backdrop-blur-sm sticky top-0 z-10">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Sports Auction
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {session?.user ? (
            <>
              <span className="flex items-center gap-2 text-black/60 dark:text-white/60">
                {session.user.name}
                <Badge variant="info">{session.user.role}</Badge>
              </span>
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
  );
}
