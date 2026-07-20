import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LandingHero } from "@/components/LandingHero";

const roleLinks: Record<string, { href: string; label: string }[]> = {
  TEAM_MANAGER: [{ href: "/manager", label: "My teams" }],
  AUCTIONEER: [{ href: "/auctioneer", label: "Auctions to run" }],
  VIEWER: [{ href: "/viewer", label: "Watch an auction" }],
};

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return <LandingHero />;
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin/rosters");
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
