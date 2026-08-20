import type { OnClockFieldKey } from "@/lib/onClockDisplay";
import { card } from "@/lib/ui";
import { categoryAccent } from "@/lib/categoryAccent";
import { fieldValue, InitialsAvatar, type OnClockTemplateProps } from "@/components/auction/onClockTemplates/shared";

const CONDENSED_FIELD_ORDER: OnClockFieldKey[] = [
  "position",
  "age",
  "previousTeam",
  "rating",
  "battingRating",
  "bowlingRating",
  "fieldingRating",
];

// True hero-card treatment: full-bleed photo (or the initials-avatar
// fallback) with a bottom gradient scrim so name/price sit legibly directly
// on the image, the same technique real trading cards use. Other selected
// fields live in a chip row below the photo, not crammed onto the scrim.
export function PhotoFocusTemplate({ player, visibleFields, photoWidth, photoHeight }: OnClockTemplateProps) {
  const heroWidth = Math.round(photoWidth * 1.5);
  const heroHeight = Math.round(photoHeight * 1.5);
  const accent = categoryAccent(player.categoryName);
  const condensed = CONDENSED_FIELD_ORDER.filter((key) => visibleFields.includes(key))
    .map((key) => fieldValue(player, key))
    .filter((v): v is string => v != null);

  return (
    <div className={`${card} overflow-hidden`}>
      <div className="relative" style={{ width: heroWidth, height: heroHeight }}>
        {visibleFields.includes("photoUrl") && player.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.photoUrl} alt={player.name} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <InitialsAvatar
            name={player.name}
            categoryName={player.categoryName}
            width={heroWidth}
            height={heroHeight}
            rounded="none"
            className="absolute inset-0"
          />
        )}

        <span
          className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm ${accent.chipSolid}`}
        >
          {player.categoryName}
        </span>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pt-10 pb-2.5">
          <p className="text-base font-extrabold uppercase tracking-tight text-white leading-tight drop-shadow-sm line-clamp-2">
            {player.name}
          </p>
          <p className="text-xs font-medium text-white/80 mt-0.5">Base price {player.basePrice}</p>
        </div>
      </div>

      {condensed.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 p-3">
          {condensed.map((c, i) => (
            <span
              key={i}
              className="rounded-md bg-black/[0.04] dark:bg-white/[0.06] px-2 py-1 text-[11px] text-black/70 dark:text-white/70"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
