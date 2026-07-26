import { requireRole } from "@/lib/auth/guards";
import { AdminTabs } from "@/components/admin/AdminTabs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("ADMIN", "LEAGUE_ADMIN");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AdminTabs showLeagues={session.user.role === "ADMIN"} />
      {children}
    </div>
  );
}
