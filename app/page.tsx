import Link from "next/link";
import { auth } from "@/auth";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

const roleLinks: Record<string, { href: string; label: string }[]> = {
  TEAM_MANAGER: [{ href: "/manager", label: "My teams" }],
  AUCTIONEER: [{ href: "/auctioneer", label: "Auctions to run" }],
  VIEWER: [{ href: "/viewer", label: "Watch an auction" }],
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; role?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold mb-2">Sports Team Player Auction</h1>
        <p className="text-black/60 dark:text-white/60 mb-6">
          Upload rosters, run tournaments, and auction players live.
        </p>
        <Link href="/login" className="underline underline-offset-2">
          Log in to continue
        </Link>
      </div>
    );
  }

  if (session.user.role === "ADMIN") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <AdminDashboard searchParams={await searchParams} />
      </div>
    );
  }

  const links = roleLinks[session.user.role] ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold mb-6">
        Welcome, {session.user.name}
      </h1>
      <ul className="flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded border border-black/10 dark:border-white/10 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
