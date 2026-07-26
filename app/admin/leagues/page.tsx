import { requireRole } from "@/lib/auth/guards";
import { LeaguesPanel } from "@/components/admin/LeaguesPanel";

export default async function LeaguesPage() {
  await requireRole("ADMIN");
  return <LeaguesPanel />;
}
