import { UsersPanel, resolveRoleTab } from "@/components/admin/UsersPanel";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const activeRole = resolveRoleTab(role);

  return (
    <UsersPanel activeRole={activeRole} roleHref={(r) => `/admin/users?role=${r}`} />
  );
}
