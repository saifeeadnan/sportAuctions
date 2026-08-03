import { requireRole } from "@/lib/auth/guards";
import { ManagerTabs } from "@/components/manager/ManagerTabs";

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("TEAM_MANAGER");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <ManagerTabs />
      {children}
    </div>
  );
}
