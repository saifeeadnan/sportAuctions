import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LandingHero } from "@/components/LandingHero";

// Every role lands straight on its own tabbed content page — no intermediate
// "click here" landing card for any of them.
export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return <LandingHero />;
  }

  const roles = new Set(session.user.memberships.map((m) => m.role));
  if (session.user.isSiteAdmin || roles.has("LEAGUE_ADMIN")) {
    redirect("/admin/rosters");
  }
  if (roles.has("TEAM_MANAGER")) {
    redirect("/manager");
  }
  if (roles.has("VIEWER")) {
    redirect("/viewer");
  }
  if (roles.has("AUCTIONEER")) {
    redirect("/auctioneer");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Welcome, {session.user.name}</h1>
    </div>
  );
}
