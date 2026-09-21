import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/lib/actions/auth.actions";
import { accessibleSections, sectionHref, sectionLabel } from "@/lib/auth/sections";
import { buttonSecondary } from "@/lib/ui";
import { LogoMark } from "@/components/ui/LogoMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NavVisibility } from "@/components/NavVisibility";

export async function Nav() {
  const session = await auth();
  // A user can hold different roles in different leagues (e.g. TEAM_MANAGER
  // in one, VIEWER in another) — each section's own layout already allows
  // that (see lib/auth/sections.ts, which mirrors those guards), but
  // there's otherwise no link anywhere from e.g. /manager to /viewer. Only
  // shown once there's actually more than one reachable section, so a
  // single-role user sees nothing extra here.
  const sections = session?.user ? accessibleSections(session) : [];
  // session.user.name/photo come from the JWT (set once at login), so a
  // profile-photo or name change wouldn't show up here until next login
  // without this live lookup — same reasoning app/profile/page.tsx already
  // re-reads email/phone from Prisma instead of trusting the session for those.
  const photo = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, photoUrl: true, photoMimeType: true },
      })
    : null;
  const photoSrc = photo?.photoUrl ?? (photo?.photoMimeType ? `/api/users/${session!.user.id}/photo` : null);
  const displayName = photo?.name ?? session?.user?.name ?? "";

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
                {sections.length > 1 && (
                  <details className="relative">
                    <summary
                      className={`${buttonSecondary} px-3 py-1.5 text-xs cursor-pointer select-none list-none`}
                    >
                      Switch view
                    </summary>
                    <div className="absolute right-0 mt-1 w-40 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg py-1 z-20">
                      {sections.map((s) => (
                        <Link
                          key={s}
                          href={sectionHref(s)}
                          className="block px-3 py-1.5 text-xs text-black/70 dark:text-white/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-black dark:hover:text-white transition-colors"
                        >
                          {sectionLabel(s)}
                        </Link>
                      ))}
                    </div>
                  </details>
                )}
                <Link
                  href="/profile"
                  className="flex items-center gap-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
                >
                  {photoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoSrc}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 shrink-0"
                    />
                  ) : (
                    <span className="h-6 w-6 rounded-full bg-black/10 dark:bg-white/15 flex items-center justify-center text-[10px] font-medium shrink-0">
                      {(displayName || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden sm:inline truncate max-w-[10rem]">{displayName}</span>
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
