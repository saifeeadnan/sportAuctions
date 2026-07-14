import { requireRole } from "@/lib/auth/guards";

export default async function AuctioneerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("AUCTIONEER", "ADMIN");

  return <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>;
}
