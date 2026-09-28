import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPickleballEvent } from "@/lib/services/pickleballEvent.service";
import { PickleballObsView } from "@/components/pickleball/PickleballObsView";

// The token IS the access control — keep this out of search indexes, same
// posture as the broadcast auction canvas's own robots override.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The OBS-friendly canvas for one pickleball event's live results and
 * standings — deliberately public, no login, same posture as
 * app/auctioneer/auctions/[id]/broadcast and app/highlights/[token]: this
 * link is meant to be dropped straight into OBS as a browser source (which
 * doesn't carry a session cookie).
 */
export default async function PickleballObsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const initial = await getPublicPickleballEvent(token);
  if (!initial) notFound();
  return <PickleballObsView token={token} initial={initial} />;
}
