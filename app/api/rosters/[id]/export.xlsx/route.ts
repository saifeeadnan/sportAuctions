import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedRoster } from "@/lib/auth/scope";
import { toErrorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { ROSTER_EXPORT_COLUMNS, rosterExportRows } from "@/lib/services/roster.service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leagueId } = await requireAdminOrLeagueAdmin();
    const { id } = await params;
    const roster = await loadScopedRoster(id, leagueId);

    const players = await prisma.player.findMany({ where: { rosterId: id }, orderBy: { name: "asc" } });
    const header = ROSTER_EXPORT_COLUMNS.map((c) => c.header);
    const rows = rosterExportRows(players);

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Players");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const filename = roster.name.replace(/[^a-z0-9]+/gi, "-");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
