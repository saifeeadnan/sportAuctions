import { requireRole } from "@/lib/auth/guards";
import { ViewerTabs } from "@/components/viewer/ViewerTabs";

export default async function ViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("VIEWER", "TEAM_MANAGER");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <ViewerTabs />
      {children}
    </div>
  );
}
