import { displayFont } from "@/lib/fonts";
import type { CategoryAccent } from "@/lib/categoryAccent";

/**
 * The public recap surfaces' player tile (auction highlights, shareable
 * roster cards): a full-bleed 4:5 photo with a category accent stripe and a
 * compact stat block. Server-renderable — no hooks — and dark by design:
 * both host pages wrap themselves in `.dark`.
 */
export function PlayerCard({
  playerName,
  photoUrl,
  categoryName,
  accent,
  teamName,
  price,
  bidCount,
  featured = false,
  emphasizeTeamName = false,
  showPrice = true,
  isCaptain = false,
}: {
  playerName: string;
  photoUrl: string | null;
  categoryName: string;
  /** Resolved by the page via assignDistinctCategoryAccents against every
   * category shown on the page, not looked up here — a lone categoryAccent()
   * call has no way to know about sibling categories, so it can't guarantee
   * two different categories never end up the same color. */
  accent: CategoryAccent;
  /** Omitted on a single-team page (the roster card), where every tile
   * would otherwise just repeat the team name already in the header. */
  teamName?: string;
  price?: string;
  bidCount?: number;
  featured?: boolean;
  /** Team captains spotlight the team, not just the player — bumps the team
   * name up to the same visual weight as the player name instead of its
   * usual small, muted treatment. */
  emphasizeTeamName?: boolean;
  /** Team captains are a designation, not a purchase — hide the price/bid
   * row entirely rather than showing a captain-selection price. */
  showPrice?: boolean;
  /** A small amber "Captain" pill in the chip row's right slot — amber is
   * the captain color everywhere else (Badge variant="warning"). Takes the
   * slot teamName would otherwise use. */
  isCaptain?: boolean;
}) {
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
          {isCaptain ? (
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide shrink-0 bg-amber-500/15 text-amber-300">
              Captain
            </span>
          ) : teamName != null ? (
            <span
              className={
                emphasizeTeamName
                  ? "text-sm font-bold text-indigo-200 truncate"
                  : "text-[11px] text-white/50 truncate"
              }
            >
              {teamName}
            </span>
          ) : null}
        </div>
        {showPrice && price != null && (
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
        )}
      </div>
    </div>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
