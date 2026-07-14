import { requireRole } from "@/lib/auth/guards";

export default async function ViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("VIEWER");

  return <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>;
}
