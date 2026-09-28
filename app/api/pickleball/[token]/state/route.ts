import { NextResponse } from "next/server";
import { getPublicPickleballEvent } from "@/lib/services/pickleballEvent.service";

/**
 * The public, unauthenticated read the OBS view's client-side refetch calls
 * on every live-update ping (see hooks/usePickleballLive.ts) — a plain
 * navigation there would flash/flicker in an OBS browser source, so it fetches
 * JSON instead of the normal /pickleball/[token] page re-rendering. Same
 * access posture as the page itself: the token alone is the credential.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await getPublicPickleballEvent(token);
  if (!state) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
