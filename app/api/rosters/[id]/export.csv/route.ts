import { NextResponse } from "next/server";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedRoster } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { ROSTER_EXPORT_COLUMNS, rosterExportRows } from "@/lib/services/roster.service";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueId } = await requireAdminOrLeagueAdmin();
    const { id } = await params;
    const roster = await loadScopedRoster(id, leagueId);

    const players = await prisma.player.findMany({ where: { rosterId: id }, orderBy: { name: "asc" } });
    const header = ROSTER_EXPORT_COLUMNS.map((c) => c.header);
    const rows = rosterExportRows(players);
    const csv = [header, ...rows].map((row) => row.map((v) => csvEscape(String(v))).join(",")).join("\n");

    const filename = roster.name.replace(/[^a-z0-9]+/gi, "-");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
