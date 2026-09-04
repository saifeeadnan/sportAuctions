import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedRosterCard } from "@/lib/services/rosterCardShare.service";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";
import { PlayerCard, initials } from "@/components/highlights/PlayerCard";
import { assignDistinctCategoryAccents, categoryAccent } from "@/lib/categoryAccent";
import { displayFont } from "@/lib/fonts";

// Memoized per request so generateMetadata and the page share one query.
const loadCard = cache(getSharedRosterCard);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const card = await loadCard(token);
  if (!card) notFound();

  const count = card.players.length;
  const title = `${card.teamName} — ${card.auctionName}`;
  const description = `${card.tournamentName} · ${count} player${count === 1 ? "" : "s"}`;
  return {
    title,
    description,
    // Chat-app link previews (WhatsApp, iMessage) are the whole point of a
    // share link — give them a real title rather than the site-wide default.
    openGraph: { title, description },
    // The token IS the access control — keep these URLs out of search
    // indexes should one ever leak.
    robots: { index: false, follow: false },
  };
}

/**
 * A public, per-team roster card, reachable by anyone with the link — no
 * login. Like the auction highlights recap, the unguessable token is the
 * entire access control, so getSharedRosterCard never checks a session.
 * Same forced-dark celebratory shell as /highlights — see that page's notes
 * on the `.dark` wrapper.
 */
export default async function RosterCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const card = await loadCard(token);
  if (!card) notFound();

  const sponsors = await listTournamentSponsors(card.tournamentId);
  const accentByCategory = assignDistinctCategoryAccents(card.players.map((p) => p.categoryName));
  const teamAccent = categoryAccent(card.teamName);

  return (
    <div className="dark">
      <div className="min-h-screen bg-[#05060c] text-white relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[560px] w-[560px] rounded-full bg-indigo-600/25 blur-[120px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-40 right-0 h-[360px] w-[360px] rounded-full bg-amber-500/10 blur-[100px]"
        />

        <div className="relative mx-auto max-w-4xl px-4 py-12 flex flex-col gap-12">
          <SponsorRibbon sponsors={sponsors} showTopBorder={false} />

          {/* Team identity — image AND name, deliberately unlike the PNG
              roster card (which swaps the name out for the image): a web page
              has the room, and the name is what a link recipient is looking
              for. */}
          <div className="flex flex-col items-center text-center gap-4">
            {card.hasTeamImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/teams/${card.teamId}/sponsor-image`}
                alt={`${card.teamName} logo`}
                className="h-24 w-24 rounded-2xl object-contain bg-white p-2 border border-white/10"
              />
            ) : (
              <div
                className={`flex h-24 w-24 items-center justify-center rounded-2xl ${teamAccent.avatarGradient}`}
              >
                <span className="text-4xl font-bold text-white/90">{initials(card.teamName)}</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <h1
                className={`${displayFont.className} text-4xl sm:text-5xl leading-none tracking-wide text-white drop-shadow-[0_2px_20px_rgba(99,102,241,0.35)]`}
              >
                {card.teamName}
              </h1>
              <p className="text-sm text-white/50">
                {card.tournamentName} &middot; {card.auctionName}
              </p>
            </div>
          </div>

          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300/80 text-center">
              The squad &middot; {card.players.length}
            </h2>
            {card.players.length === 0 ? (
              <p className="text-center text-sm text-white/50">No players on this roster.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {card.players.map((p) => (
                  <PlayerCard
                    key={p.id}
                    playerName={p.playerName}
                    photoUrl={p.photoUrl}
                    categoryName={p.categoryName}
                    accent={accentByCategory.get(p.categoryName)!}
                    isCaptain={p.isCaptain}
                    showPrice={false}
                  />
                ))}
              </div>
            )}
          </section>

          <p className="text-center text-[11px] uppercase tracking-[0.3em] text-white/25">
            Champions are built here
          </p>
        </div>
      </div>
    </div>
  );
}
