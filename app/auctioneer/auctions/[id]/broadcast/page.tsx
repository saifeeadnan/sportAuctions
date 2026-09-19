import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { BroadcastAuctionView } from "@/components/auction/BroadcastAuctionView";

// The auction id IS the access control here (see the page doc comment
// below) — keep this out of search indexes, same reasoning as
// app/roster-card/[token]'s own robots override.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The OBS-friendly broadcast canvas — deliberately public, no login, same
 * posture as app/highlights/[token] and app/roster-card/[token]: this link
 * is meant to be dropped straight into OBS as a browser source (which
 * doesn't carry the auctioneer's session cookie) and shared with
 * co-streamers. The auction id is the entire access control here, mirrored
 * on the live-update side by server.ts's separate, equally unauthenticated
 * "join:public" socket handler.
 */
export default async function BroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const state = await getAuctionState(id);
  if (!state) notFound();

  const auction = await prisma.auction.findUnique({ where: { id }, select: { tournamentId: true } });
  const sponsors = auction ? await listTournamentSponsors(auction.tournamentId) : [];

  return <BroadcastAuctionView initialState={state} sponsors={sponsors} />;
}
