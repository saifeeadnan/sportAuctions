import Link from "next/link";
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-8">
        {leagues && <AdminLeagueSidebar leagues={leagues} />}
        <div className="flex-1 min-w-0">
          {leagues && <ActiveLeagueBanner leagues={leagues} />}
          <div className="flex items-center justify-between gap-4 mb-4">
            <AdminTabs />
            {isSiteAdmin && (
              <Link
                href="/admin/analytics"
                className="shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
              >
                Analytics
              </Link>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
