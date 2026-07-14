import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const { id } = await params;
  const auctionPlayers = await prisma.auctionPlayer.findMany({
    where: { auctionId: id },
    include: { player: true, category: true, soldToEntry: { include: { team: true } } },
    orderBy: { player: { name: "asc" } },
  });

  const header = ["Player", "Category", "Base Price", "Status", "Sold To Team", "Sold Price", "Sold Via"];
  const rows = auctionPlayers.map((ap) => [
    ap.player.name,
    ap.category.name,
    String(ap.category.basePrice),
    ap.status,
    ap.soldToEntry?.team.name ?? "",
    ap.soldPrice != null ? String(ap.soldPrice) : "",
    ap.soldVia ?? "",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="auction-${id}-results.csv"`,
    },
  });
}
