import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";

/** Mobile has no page URL carrying a tournamentId the way the web app does
 * (it only ever navigates by auctionId) — this resolves auction -> tournament
 * server-side, mirroring my-team/route.ts's own reasoning exactly. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id: auctionId } = await params;

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: { tournamentId: true },
    });
    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    const sponsors = await listTournamentSponsors(auction.tournamentId);
    return NextResponse.json(
      sponsors.map((s) => ({
        id: s.id,
        name: s.name,
        tier: s.tier,
        websiteUrl: s.websiteUrl,
        logoUrl: s.logoUrl,
      }))
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
