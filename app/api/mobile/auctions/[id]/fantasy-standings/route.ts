import { NextResponse } from "next/server";
import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { ValidationError } from "@/lib/errors";
import {
  getFantasyEligibility,
  getFantasyStandings,
  isFantasyEditingLocked,
} from "@/lib/services/fantasyTeam.service";

/** The mobile twin of the viewer fantasy page's locked-state standings —
 * every fantasy team ranked, with movement since the previous points upload.
 * Only meaningful once picks have locked; before that the app shows the
 * builder, so this just reports `locked: false`. `isMine` is resolved here
 * (the app's own user record loads asynchronously) and the User row is never
 * shipped — only the owner's display name. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const { id: auctionId } = await params;

    const eligibility = await getFantasyEligibility(auctionId, session.user.id, allLeagueIds(session));
    if (!eligibility.eligible) throw new ValidationError(eligibility.reason);
    if (!isFantasyEditingLocked(eligibility.auction)) {
      return NextResponse.json({ locked: false });
    }

    const { hasPoints, latestUpload, previousUpload, standings } = await getFantasyStandings(auctionId);
    const uploadInfo = (u: { uploadedAt: Date; label: string | null } | null) =>
      u ? { uploadedAt: u.uploadedAt.toISOString(), label: u.label } : null;

    return NextResponse.json({
      locked: true,
      hasPoints,
      latestUpload: uploadInfo(latestUpload),
      previousUpload: uploadInfo(previousUpload),
      standings: standings.map((s) => ({
        teamId: s.team.id,
        teamName: s.team.name,
        ownerName: s.team.user.name,
        isMine: s.team.userId === session.user.id,
        rank: s.rank,
        previousRank: s.previousRank,
        rankDelta: s.rankDelta,
        pointsDelta: s.pointsDelta,
        totalPoints: s.totalPoints,
        totalSpend: s.totalSpend,
        picks: s.team.picks.map((p) => ({
          auctionPlayerId: p.auctionPlayerId,
          playerName: p.auctionPlayer.player.name,
          price: String(p.price),
          points: p.auctionPlayer.points != null ? String(p.auctionPlayer.points) : null,
        })),
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
