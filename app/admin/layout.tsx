import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { listLeagues } from "@/lib/services/league.service";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminLeagueSidebar } from "@/components/admin/AdminLeagueSidebar";
import { ActiveLeagueBanner } from "@/components/admin/ActiveLeagueBanner";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("ADMIN", "LEAGUE_ADMIN");
  const isSiteAdmin = session.user.role === "ADMIN";
  const leagues = isSiteAdmin ? await listLeagues() : null;

  // A League Admin has no sidebar switcher (they're always confined to one
  // league, never a choice), but they still deserve the same logo/name
  // banner the site ADMIN gets after picking a league from the sidebar.
  const myLeague =
    !isSiteAdmin && session.user.leagueId
      ? await prisma.league.findUnique({
          where: { id: session.user.leagueId },
          include: { logo: { select: { id: true } } },
        })
      : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-8">
        {leagues && <AdminLeagueSidebar leagues={leagues} />}
        <div className="flex-1 min-w-0">
          {leagues && <ActiveLeagueBanner leagues={leagues} />}
          {myLeague && <ActiveLeagueBanner fixedLeague={myLeague} />}
          <AdminTabs />
          {children}
        </div>
      </div>
    </div>
  );
}
