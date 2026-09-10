import { NextResponse } from "next/server";
import { requireRole, allLeagueIds } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { getSeedingSheet, submitSeeds } from "@/lib/services/playerSeeding.service";

/** Mirrors the web /viewer/rate/[rosterId] page — one GET returns
 * eligibility + window status + (depending on status) the rater's own
 * sheet or the published final order. Never another rater's answers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const { id: rosterId } = await params;
    const sheet = await getSeedingSheet(rosterId, session.user.id, allLeagueIds(session));

    if (!sheet.eligible) {
      return NextResponse.json({ eligible: false, reason: sheet.reason });
    }
    if (sheet.status === "finalized") {
      return NextResponse.json({
        eligible: true,
        status: "finalized",
        rosterName: sheet.rosterName,
        leagueName: sheet.leagueName,
        selfPlayerId: sheet.selfPlayerId,
        finalSeeding: sheet.finalSeeding,
      });
    }
    return NextResponse.json({
      eligible: true,
      status: sheet.status,
      rosterName: sheet.rosterName,
      leagueName: sheet.leagueName,
      opensAt: sheet.opensAt.toISOString(),
      closesAt: sheet.closesAt.toISOString(),
      maxSeed: sheet.maxSeed,
      players: sheet.players,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const { id: rosterId } = await params;
    const body = await req.json().catch(() => null);
    const seeds = Array.isArray(body?.seeds)
      ? body.seeds
          .filter(
            (s: unknown): s is { playerId: string; seed: number } =>
              typeof s === "object" &&
              s !== null &&
              typeof (s as { playerId?: unknown }).playerId === "string" &&
              typeof (s as { seed?: unknown }).seed === "number"
          )
      : [];

    await submitSeeds(rosterId, session.user.id, allLeagueIds(session), seeds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
