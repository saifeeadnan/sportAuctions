import { NextResponse } from "next/server";
import { requireSession, allLeagueIds } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { listViewableAuctions } from "@/lib/services/auction.service";

export async function GET() {
  try {
    const session = await requireSession();
    const auctions = await listViewableAuctions(allLeagueIds(session));
    return NextResponse.json(
      auctions.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        tournamentId: a.tournament.id,
        tournamentName: a.tournament.name,
      }))
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
