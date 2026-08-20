import type { OnClockFieldKey } from "@/lib/onClockDisplay";
import { ON_CLOCK_FIELD_LABELS } from "@/lib/onClockDisplay";
import { card } from "@/lib/ui";
import { categoryAccent } from "@/lib/categoryAccent";
import { InitialsAvatar, type OnClockTemplateProps } from "@/components/auction/onClockTemplates/shared";

const STAT_FIELD_ORDER: OnClockFieldKey[] = [
  "position",
  "age",
  "previousTeam",
  "rating",
  "battingRating",
  "bowlingRating",
  "fieldingRating",
];

const RAW_VALUE: Record<OnClockFieldKey, (p: OnClockTemplateProps["player"]) => string | number | null> = {
  photoUrl: () => null,
  position: (p) => p.position,
  age: (p) => p.age,
  previousTeam: (p) => p.previousTeam,
  rating: (p) => p.rating,
  battingRating: (p) => p.battingRating,
  bowlingRating: (p) => p.bowlingRating,
  fieldingRating: (p) => p.fieldingRating,
};

// FUT-style stat grid instead of a plain data table: a circular avatar,
// a name/category header, then a grid of small tiles — big bold value on
// top, small uppercase label underneath. grid-cols-2 stays fixed (not a
// viewport breakpoint) since this card's width is driven by whatever layout
// embeds it, not the page viewport.
export function StatsTableTemplate({ player, visibleFields, photoWidth, photoHeight }: OnClockTemplateProps) {
  const accent = categoryAccent(player.categoryName);
  const avatarSize = Math.round(Math.min(photoWidth, photoHeight) * 0.7);
  const tiles = STAT_FIELD_ORDER.filter((key) => visibleFields.includes(key))
    .map((key) => ({ label: ON_CLOCK_FIELD_LABELS[key], value: RAW_VALUE[key](player) }))
    .filter((row): row is { label: string; value: string | number } => row.value != null);

  return (
    <div className={`${card} flex flex-col items-center gap-3 p-4 text-center`}>
      {visibleFields.includes("photoUrl") &&
        (player.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.photoUrl}
            alt={player.name}
            className={`rounded-full object-cover ring-2 ${accent.ring}`}
            style={{ width: avatarSize, height: avatarSize }}
          />
        ) : (
          <InitialsAvatar
            name={player.name}
            categoryName={player.categoryName}
            width={avatarSize}
            height={avatarSize}
            rounded="full"
            className={`ring-2 ${accent.ring}`}
          />
        ))}

      <div>
        <p className="text-base font-bold leading-tight">{player.name}</p>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide mt-1 ${accent.chipSoft}`}
        >
          {player.categoryName}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full">
        <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.05] py-2 px-1">
          <p className="text-sm font-bold">{player.basePrice}</p>
          <p className="text-[10px] uppercase tracking-wide text-black/50 dark:text-white/50 mt-0.5">
            Base price
          </p>
        </div>
        <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.05] py-2 px-1">
          <p className="text-sm font-bold">{player.bidCount}</p>
          <p className="text-[10px] uppercase tracking-wide text-black/50 dark:text-white/50 mt-0.5">Bids</p>
        </div>
        {tiles.map((row) => (
          <div key={row.label} className="rounded-lg bg-black/[0.03] dark:bg-white/[0.05] py-2 px-1">
            <p className="text-sm font-bold">{row.value}</p>
            <p className="text-[10px] uppercase tracking-wide text-black/50 dark:text-white/50 mt-0.5">
              {row.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
