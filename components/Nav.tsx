import Link from "next/link";
import { auth } from "@/auth";
import { logoutAction } from "@/lib/actions/auth.actions";

export async function Nav() {
  const session = await auth();

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold">
          Sports Auction
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {session?.user ? (
            <>
              <span className="text-black/60 dark:text-white/60">
                {session.user.name} &middot; {session.user.role}
              </span>
              <form action={logoutAction}>
                <button type="submit" className="underline underline-offset-2">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="underline underline-offset-2">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
