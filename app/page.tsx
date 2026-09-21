import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LandingHero } from "@/components/LandingHero";

// Every role lands straight on its own tabbed content page — no intermediate
// "click here" landing card for any of them.
export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    // Global, platform-wide counts for the landing page's social-proof
    // strip — deliberately "auctions COMPLETED", not every auction row, so
    // it can't be inflated by auctions that were only ever created and
    // never actually run.
    const [leagueCount, tournamentCount, completedAuctionCount] = await Promise.all([
      prisma.league.count(),
      prisma.tournament.count(),
      prisma.auction.count({ where: { status: "COMPLETED" } }),
    ]);
    return (
      <LandingHero
        stats={{ leagueCount, tournamentCount, completedAuctionCount }}
      />
    );
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

  // The JWT's name is fixed at login, so re-read it — a just-edited profile
  // name would otherwise keep greeting the old one until the next sign-in.
  const account = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } });

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Welcome, {account?.name ?? session.user.name}</h1>
    </div>
  );
}
