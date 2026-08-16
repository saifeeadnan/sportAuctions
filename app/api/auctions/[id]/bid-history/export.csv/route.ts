import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const { id } = await params;
    const auction = await loadScopedAuction(id, leagueIds);

    // Every bid ever placed, including on players later removed/reset —
    // the Bid table is permanent history, never deleted or rewritten.
    const bids = await prisma.bid.findMany({
      where: { auctionPlayer: { auctionId: id } },
      include: {
        auctionPlayer: { include: { player: true, category: true } },
        teamAuctionEntry: { include: { team: true } },
      },
      orderBy: [{ auctionPlayer: { player: { name: "asc" } } }, { createdAt: "asc" }],
    });

    const header = ["Player", "Category", "Bid #", "Team", "Amount", "Time"];
    const rows: string[][] = [];
    let currentPlayerId: string | null = null;
    let seq = 0;
    for (const bid of bids) {
      if (bid.auctionPlayerId !== currentPlayerId) {
        currentPlayerId = bid.auctionPlayerId;
        seq = 0;
      }
      seq += 1;
      rows.push([
        bid.auctionPlayer.player.name,
        bid.auctionPlayer.category.name,
        String(seq),
        bid.teamAuctionEntry.team.name,
        String(bid.amount),
        bid.createdAt.toISOString(),
      ]);
    }

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${auction.name.replace(/[^a-z0-9]+/gi, "-")}-bid-history.csv"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
