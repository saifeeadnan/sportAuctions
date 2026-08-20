import type { OnClockFieldKey } from "@/lib/onClockDisplay";
import { card } from "@/lib/ui";
import { categoryAccent } from "@/lib/categoryAccent";
import { fieldValue, InitialsAvatar, type OnClockTemplateProps } from "@/components/auction/onClockTemplates/shared";

const EXTRA_FIELD_ORDER: OnClockFieldKey[] = [
  "position",
  "age",
  "previousTeam",
  "rating",
  "battingRating",
  "bowlingRating",
  "fieldingRating",
];

export function ClassicTemplate({ player, visibleFields, photoWidth, photoHeight }: OnClockTemplateProps) {
  const extraFields = EXTRA_FIELD_ORDER.filter((key) => visibleFields.includes(key));
  const accent = categoryAccent(player.categoryName);

  return (
    <div className={`${card} overflow-hidden`}>
      <div className={`h-1.5 ${accent.bar}`} />
      <div className="flex flex-col items-center text-center gap-2.5 p-4 pt-4">
        {visibleFields.includes("photoUrl") &&
          (player.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.photoUrl}
              alt={player.name}
              className="rounded-lg object-cover bg-black/5 dark:bg-white/5 shadow-sm"
              style={{ width: photoWidth, height: photoHeight }}
            />
          ) : (
            <InitialsAvatar
              name={player.name}
              categoryName={player.categoryName}
              width={photoWidth}
              height={photoHeight}
            />
          ))}

        <div className="flex flex-col items-center gap-1">
          <p className="text-lg font-bold tracking-tight leading-tight">{player.name}</p>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${accent.chipSoft}`}
          >
            {player.categoryName}
          </span>
        </div>

        <p className="text-sm text-black/60 dark:text-white/60">Base price {player.basePrice}</p>

        <span className="inline-flex items-center rounded-full bg-black/5 dark:bg-white/10 px-2.5 py-1 text-xs font-medium text-black/70 dark:text-white/70">
          {player.bidCount === 0
            ? "No bids yet"
            : `${player.bidCount} bid${player.bidCount === 1 ? "" : "s"} placed`}
        </span>

        {extraFields.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 pt-2 mt-1 border-t border-black/5 dark:border-white/10 w-full">
            {extraFields.map((key) => {
              const value = fieldValue(player, key);
              if (value == null) return null;
              return (
                <span
                  key={key}
                  className="rounded-md bg-black/[0.04] dark:bg-white/[0.06] px-2 py-1 text-[11px] text-black/70 dark:text-white/70"
                >
                  {value}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
