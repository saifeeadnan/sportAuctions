import type { AuctionStatePlayer } from "@/lib/services/auctionState.service";
import { ON_CLOCK_FIELD_LABELS, type OnClockFieldKey } from "@/lib/onClockDisplay";
import { categoryAccent } from "@/lib/categoryAccent";

export type OnClockTemplateProps = {
  player: AuctionStatePlayer;
  visibleFields: OnClockFieldKey[];
  photoWidth: number;
  photoHeight: number;
};

/** { label, value } for one selected field, or null if that player has no
 * data for it (so templates can skip it entirely). photoUrl isn't handled
 * here — it's rendered as an image, not a text/stat line. */
export function fieldLabelValue(
  player: AuctionStatePlayer,
  key: OnClockFieldKey
): { label: string; value: string | number } | null {
  switch (key) {
    case "photoUrl":
      return null;
    case "position":
      return player.position ? { label: ON_CLOCK_FIELD_LABELS.position, value: player.position } : null;
    case "age":
      return player.age != null ? { label: ON_CLOCK_FIELD_LABELS.age, value: player.age } : null;
    case "previousTeam":
      return player.previousTeam
        ? { label: ON_CLOCK_FIELD_LABELS.previousTeam, value: player.previousTeam }
        : null;
    case "rating":
      return player.rating != null ? { label: ON_CLOCK_FIELD_LABELS.rating, value: player.rating } : null;
    case "battingRating":
      return player.battingRating != null
        ? { label: ON_CLOCK_FIELD_LABELS.battingRating, value: player.battingRating }
        : null;
    case "bowlingRating":
      return player.bowlingRating != null
        ? { label: ON_CLOCK_FIELD_LABELS.bowlingRating, value: player.bowlingRating }
        : null;
    case "fieldingRating":
      return player.fieldingRating != null
        ? { label: ON_CLOCK_FIELD_LABELS.fieldingRating, value: player.fieldingRating }
        : null;
  }
}

/** "Label: value" for one selected field, or null — same behavior as
 * before, just built on top of fieldLabelValue now. */
export function fieldValue(player: AuctionStatePlayer, key: OnClockFieldKey): string | null {
  const lv = fieldLabelValue(player, key);
  return lv ? `${lv.label}: ${lv.value}` : null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Shared "no photo" fallback — a category-colored initials tile, used by
 * all three templates instead of a plain gray box. */
export function InitialsAvatar({
  name,
  categoryName,
  width,
  height,
  rounded = "lg",
  className = "",
}: {
  name: string;
  categoryName: string;
  width: number;
  height: number;
  rounded?: "lg" | "full" | "none";
  className?: string;
}) {
  const accent = categoryAccent(categoryName);
  // A discrete prop, not a className appended after a baked-in default —
  // Tailwind's generated stylesheet order (not JSX string order) decides
  // which same-property utility wins, so each template picks its shape
  // explicitly rather than trying to override one.
  const roundedClass = rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-lg" : "";
  const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.36));
  return (
    <div
      className={`flex items-center justify-center font-bold text-white ${accent.avatarGradient} ${roundedClass} ${className}`}
      style={{ width, height, fontSize }}
    >
      {initials(name)}
    </div>
  );
}
