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

    const entries = await prisma.teamAuctionEntry.findMany({
      where: { auctionId: id },
      include: { team: true },
      orderBy: { team: { name: "asc" } },
    });
    const submissions = await prisma.preAuctionSubmission.findMany({
      where: { teamAuctionEntry: { auctionId: id } },
      include: {
        teamAuctionEntry: { include: { team: true } },
        auctionPlayer: { include: { player: true } },
      },
    });

    // Same pivot (one row per distinct player, one column per team) as the
    // lock-review page itself, so the export matches what's on screen.
    const teamsByPlayer = new Map<string, string[]>();
    const playerNameById = new Map<string, string>();
    for (const s of submissions) {
      const list = teamsByPlayer.get(s.auctionPlayerId) ?? [];
      list.push(s.teamAuctionEntry.team.name);
      teamsByPlayer.set(s.auctionPlayerId, list);
      playerNameById.set(s.auctionPlayerId, s.auctionPlayer.player.name);
    }

    const teamNames = entries.map((e) => e.team.name);
    const playerRows = Array.from(teamsByPlayer.entries())
      .map(([playerId, teams]) => ({
        playerName: playerNameById.get(playerId) ?? "",
        teams,
      }))
      .sort((a, b) => b.teams.length - a.teams.length || a.playerName.localeCompare(b.playerName));

    const header = ["Player", ...teamNames];
    const rows = playerRows.map((row) => {
      const isContested = row.teams.length > 1;
      return [
        isContested ? `${row.playerName} (${row.teams.length})` : row.playerName,
        ...teamNames.map((teamName) =>
          row.teams.includes(teamName) ? (isContested ? "Y" : teamName) : ""
        ),
      ];
    });

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${auction.name.replace(/[^a-z0-9]+/gi, "-")}-draft-review.csv"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
