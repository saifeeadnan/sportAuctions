import { notFound } from "next/navigation";
import { Bebas_Neue } from "next/font/google";
import { getAuctionHighlights } from "@/lib/services/auctionHighlights.service";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";
import { categoryAccent } from "@/lib/categoryAccent";

const displayFont = Bebas_Neue({ weight: "400", subsets: ["latin"] });

/**
 * A public recap page, reachable by anyone with the link — no login. This
 * is the only intentionally-unauthenticated page in the app; the token
 * itself (an unguessable random string) is the entire access control, so
 * getAuctionHighlights deliberately never checks a session here.
 *
 * Deliberately dark regardless of the viewer's own site-wide theme toggle —
 * a one-off celebratory "recap" moment, not the everyday utilitarian UI the
 * rest of the app uses. Wrapping in `dark` (rather than forking every
 * shared component into a light/dark pair) piggybacks on globals.css's own
 * `@custom-variant dark (&:where(.dark, .dark *))`, so already dark-mode-
 * aware shared pieces (SponsorRibbon) render correctly here without any
 * changes of their own.
 */
export default async function HighlightsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const highlights = await getAuctionHighlights(token);
  if (!highlights) notFound();

  const sponsors = await listTournamentSponsors(highlights.tournamentId);
  const maxSpend = Math.max(1, ...highlights.spendByCategory.map((c) => Number(c.totalSpent)));

  return (
    <div className="dark">
      <div className="min-h-screen bg-[#05060c] text-white relative overflow-hidden">
        {/* Two soft radial glows behind the header — the only decorative
            flourish, kept quiet so it reads as "arena lighting," not noise. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[560px] w-[560px] rounded-full bg-indigo-600/25 blur-[120px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-40 right-0 h-[360px] w-[360px] rounded-full bg-amber-500/10 blur-[100px]"
        />

        <div className="relative mx-auto max-w-4xl px-4 py-12 flex flex-col gap-12">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-3">
            <h1
              className={`${displayFont.className} text-5xl sm:text-6xl leading-none tracking-wide text-white drop-shadow-[0_2px_20px_rgba(99,102,241,0.35)]`}
            >
              Auction Legends
            </h1>
            <p className="text-sm text-white/50">{highlights.tournamentName}</p>

            <div className="flex items-center gap-3 mt-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-center">
                <p className={`${displayFont.className} text-3xl text-emerald-400 leading-none`}>
                  {highlights.soldCount}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mt-1">Sold</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-center">
                <p className={`${displayFont.className} text-3xl text-white/60 leading-none`}>
                  {highlights.unsoldCount}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mt-1">Unsold</p>
              </div>
            </div>
          </div>

          {/* Biggest buy per category */}
          {highlights.biggestBuyByCategory.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300/80 text-center">
                Biggest buy by category
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                {highlights.biggestBuyByCategory.map((b, i) => (
                  <PlayerCard
                    key={b.categoryName}
                    rank={i + 1}
                    playerName={b.playerName}
                    photoUrl={b.photoUrl}
                    categoryName={b.categoryName}
                    teamName={b.teamName}
                    price={b.price}
                    bidCount={b.bidCount}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Best value pick — one featured spotlight card */}
          {highlights.bestValuePick && (
            <section className="flex flex-col items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300/90">
                Best value pick
              </h2>
              <PlayerCard
                playerName={highlights.bestValuePick.playerName}
                photoUrl={highlights.bestValuePick.photoUrl}
                categoryName={highlights.bestValuePick.categoryName}
                teamName={highlights.bestValuePick.teamName}
                price={highlights.bestValuePick.price}
                featured
              />
            </section>
          )}

          {/* Spend by category — horizontal bar chart */}
          {highlights.spendByCategory.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300/80 text-center">
                Spend by category
              </h2>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-4">
                {highlights.spendByCategory.map((c) => {
                  const accent = categoryAccent(c.categoryName);
                  const pct = Math.max(4, (Number(c.totalSpent) / maxSpend) * 100);
                  return (
                    <div key={c.categoryName} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium text-white">{c.categoryName}</span>
                        <span className="text-white/50 text-xs shrink-0">
                          {c.playersSold} player{c.playersSold === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${accent.bar} flex items-center justify-end pr-2`}
                          style={{ width: `${pct}%` }}
                        >
                          {pct > 22 && (
                            <span className="text-[11px] font-semibold text-black/70 tabular-nums">
                              {c.totalSpent}
                            </span>
                          )}
                        </div>
                      </div>
                      {pct <= 22 && (
                        <span className="text-[11px] font-semibold text-white/70 tabular-nums self-end -mt-1">
                          {c.totalSpent}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <SponsorRibbon sponsors={sponsors} />

          <p className="text-center text-[11px] uppercase tracking-[0.3em] text-white/25">
            Champions are built here
          </p>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({
  rank,
  playerName,
  photoUrl,
  categoryName,
  teamName,
  price,
  bidCount,
  featured = false,
}: {
  rank?: number;
  playerName: string;
  photoUrl: string | null;
  categoryName: string;
  teamName: string;
  price: string;
  bidCount?: number;
  featured?: boolean;
}) {
  const accent = categoryAccent(categoryName);

  return (
    <div
      className={`relative rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden ${
        featured ? "w-full max-w-sm" : ""
      }`}
    >
      {/* Full-bleed photo — the dominant element, not a small centered
          thumbnail floating in a mostly-empty card. */}
      <div className="relative w-full aspect-[4/5]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={playerName} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center ${accent.avatarGradient}`}>
            <span className={`font-bold text-white/90 ${featured ? "text-5xl" : "text-4xl"}`}>
              {initials(playerName)}
            </span>
          </div>
        )}
        <div className={`absolute inset-x-0 top-0 h-1 ${accent.bar}`} />
        {rank && (
          <span
            className={`absolute top-2 left-2 h-5 w-5 rounded-full ${accent.chipSolid} text-[11px] font-bold flex items-center justify-center shadow`}
          >
            {rank}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* Compact stat block — three tight rows, no separately-spaced blocks. */}
      <div className={`flex flex-col gap-1 ${featured ? "p-3" : "p-2"}`}>
        <p className={`font-semibold leading-tight truncate ${featured ? "text-base" : "text-sm"}`}>{playerName}</p>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide shrink-0 ${accent.chipSoft}`}
          >
            {categoryName}
          </span>
          <span className="text-[11px] text-white/50 truncate">{teamName}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <p className={`${displayFont.className} tracking-wide text-amber-300 leading-none ${featured ? "text-2xl" : "text-xl"}`}>
            {price}
          </p>
          {bidCount != null && (
            <span className="text-[10px] text-white/40 shrink-0">
              {bidCount === 0 ? "No bids" : `${bidCount} bid${bidCount === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
