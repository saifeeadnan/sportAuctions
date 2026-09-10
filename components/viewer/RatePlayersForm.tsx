"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitSeedsAction } from "@/lib/actions/playerSeeding.actions";
import { POSITION_GROUPS, type PositionGroup } from "@/lib/teamStrength";
import { card, selectClass, buttonPrimary, tabsTrack, tabItem } from "@/lib/ui";

export type RatablePlayer = {
  playerId: string;
  name: string;
  position: string | null;
  photoUrl: string | null;
  positionGroup: PositionGroup;
  mySeed: number | null;
};

export function RatePlayersForm({
  rosterId,
  players,
  maxSeed,
}: {
  rosterId: string;
  players: RatablePlayer[];
  maxSeed: number;
}) {
  const router = useRouter();
  const [seeds, setSeeds] = useState<Map<string, number | null>>(
    new Map(players.map((p) => [p.playerId, p.mySeed]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const groups = POSITION_GROUPS.filter((g) => players.some((p) => p.positionGroup === g));
  const [activeGroup, setActiveGroup] = useState<PositionGroup>(groups[0] ?? "Other");
  const effectiveGroup = groups.includes(activeGroup) ? activeGroup : (groups[0] ?? "Other");
  const visiblePlayers = players.filter((p) => p.positionGroup === effectiveGroup);

  function setSeed(playerId: string, value: string) {
    setSeeds((prev) => {
      const next = new Map(prev);
      next.set(playerId, value === "" ? null : Number(value));
      return next;
    });
    setSavedCount(null);
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const payload = Array.from(seeds.entries())
      .filter((entry): entry is [string, number] => entry[1] != null)
      .map(([playerId, seed]) => ({ playerId, seed }));
    const result = await submitSeedsAction(rosterId, payload);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSavedCount(payload.length);
    router.refresh();
  }

  const ratedCount = Array.from(seeds.values()).filter((v) => v != null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className={tabsTrack}>
        {groups.map((g) => {
          const ratedInGroup = players.filter((p) => p.positionGroup === g && seeds.get(p.playerId) != null).length;
          const totalInGroup = players.filter((p) => p.positionGroup === g).length;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGroup(g)}
              className={tabItem(effectiveGroup === g)}
            >
              {g} ({ratedInGroup}/{totalInGroup})
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-1.5">
        {visiblePlayers.map((p) => (
          <li key={p.playerId} className={`${card} flex items-center gap-3 text-sm px-3 py-2`}>
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt={p.name} className="h-8 w-8 rounded-full object-cover shrink-0" />
            ) : (
              <span className="h-8 w-8 rounded-full bg-black/5 dark:bg-white/10 shrink-0" />
            )}
            <span className="flex-1">
              {p.name}
              {p.position && <span className="text-black/50 dark:text-white/50"> ({p.position})</span>}
            </span>
            <select
              value={seeds.get(p.playerId) ?? ""}
              onChange={(e) => setSeed(p.playerId, e.target.value)}
              className={`${selectClass} py-1 text-xs w-20`}
              aria-label={`Seed for ${p.name}`}
            >
              <option value="">—</option>
              {Array.from({ length: maxSeed }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button type="button" disabled={loading} onClick={handleSave} className={`${buttonPrimary} self-start`}>
          {loading ? "Saving…" : "Save ratings"}
        </button>
        <span className="text-sm text-black/60 dark:text-white/60">
          {ratedCount} of {players.length} rated
        </span>
      </div>
      {savedCount != null && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved {savedCount} rating(s).</p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
