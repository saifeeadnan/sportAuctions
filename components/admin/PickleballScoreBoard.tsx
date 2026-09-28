"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enterGameScoreAction, clearGameScoreAction } from "@/lib/actions/pickleballScoring.actions";
import { usePickleballLive } from "@/hooks/usePickleballLive";
import type { ScoringMatchView, ScoringGameView } from "@/lib/services/pickleballScoring.service";
import { buttonPrimary, buttonSecondary, card, selectClass, inputClass, tabsTrack, tabItem } from "@/lib/ui";

type Roster = { id: string; name: string }[];
type Pair = { key: string; label: string; player1Id: string; player2Id: string };

/** Every unordered 2-player combination a roster can field — for a 4-player
 * roster that's the full 6 pairs (4 choose 2), scaling the same way for any
 * other roster size. Picking a pair, rather than 2 separate player
 * dropdowns, makes "the same player twice" structurally impossible instead
 * of a validation error, and halves the number of controls per side. */
function pairsOf(roster: Roster): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      pairs.push({
        key: `${roster[i].id}:${roster[j].id}`,
        label: `${roster[i].name} & ${roster[j].name}`,
        player1Id: roster[i].id,
        player2Id: roster[j].id,
      });
    }
  }
  return pairs;
}

/** The pair matching a game's already-saved 2 player ids, in whichever
 * slot order they were stored — "" (no selection) if either is blank or
 * the roster has since changed and no longer has that exact pair. */
function pairKeyFor(pairs: Pair[], player1Id: string | null, player2Id: string | null): string {
  if (!player1Id || !player2Id) return "";
  const match = pairs.find(
    (p) => (p.player1Id === player1Id && p.player2Id === player2Id) || (p.player1Id === player2Id && p.player2Id === player1Id)
  );
  return match?.key ?? "";
}

function GameRow({
  tournamentId,
  eventId,
  game,
  team1Name,
  team2Name,
  team1Roster,
  team2Roster,
}: {
  tournamentId: string;
  eventId: string;
  game: ScoringGameView;
  team1Name: string;
  team2Name: string;
  team1Roster: Roster;
  team2Roster: Roster;
}) {
  const router = useRouter();
  const team1Pairs = pairsOf(team1Roster);
  const team2Pairs = pairsOf(team2Roster);
  const [team1PairKey, setTeam1PairKey] = useState(() => pairKeyFor(team1Pairs, game.team1Player1Id, game.team1Player2Id));
  const [team2PairKey, setTeam2PairKey] = useState(() => pairKeyFor(team2Pairs, game.team2Player1Id, game.team2Player2Id));
  const [team1Score, setTeam1Score] = useState(game.team1Score?.toString() ?? "");
  const [team2Score, setTeam2Score] = useState(game.team2Score?.toString() ?? "");
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The Clear button shows once anything is actually saved — a lineup with
  // no score yet is still real, clearable state, not just a score.
  const hasSavedData =
    game.team1Score !== null ||
    game.team2Score !== null ||
    game.team1Player1Id !== null ||
    game.team1Player2Id !== null ||
    game.team2Player1Id !== null ||
    game.team2Player2Id !== null;

  // Same checks the server makes, for instant feedback before the round trip.
  // Both scores blank is a valid save (the lineup, with no result yet) — only
  // exactly one of the two being filled in is rejected.
  const t1Score = Number(team1Score);
  const t2Score = Number(team2Score);
  const scoresBothBlank = team1Score === "" && team2Score === "";
  const scoresValid =
    team1Score !== "" && team2Score !== "" && Number.isInteger(t1Score) && Number.isInteger(t2Score) && t1Score >= 0 && t2Score >= 0;
  const tied = scoresValid && t1Score === t2Score;
  const canSave = team1PairKey !== "" && team2PairKey !== "" && (scoresBothBlank || (scoresValid && !tied));

  async function handleSave() {
    const team1Pair = team1Pairs.find((p) => p.key === team1PairKey);
    const team2Pair = team2Pairs.find((p) => p.key === team2PairKey);
    if (!team1Pair || !team2Pair) return;
    setBusy("save");
    setError(null);
    const result = await enterGameScoreAction(tournamentId, eventId, game.id, {
      team1Player1Id: team1Pair.player1Id,
      team1Player2Id: team1Pair.player2Id,
      team2Player1Id: team2Pair.player1Id,
      team2Player2Id: team2Pair.player2Id,
      team1Score: scoresBothBlank ? null : t1Score,
      team2Score: scoresBothBlank ? null : t2Score,
    });
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleClear() {
    if (!window.confirm("Clear this game's score and players?")) return;
    setBusy("clear");
    setError(null);
    const result = await clearGameScoreAction(tournamentId, eventId, game.id);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setTeam1PairKey("");
    setTeam2PairKey("");
    setTeam1Score("");
    setTeam2Score("");
    router.refresh();
  }

  const pairSelect = (label: string, value: string, onChange: (v: string) => void, pairs: Pair[]) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`${label} pair`}
      className={`${selectClass} text-xs py-1 px-1.5 w-60 sm:w-75 truncate`}
    >
      <option value="">— pair —</option>
      {pairs.map((p) => (
        <option key={p.key} value={p.key} title={p.label}>
          {p.label}
        </option>
      ))}
    </select>
  );

  const scoreInput = (label: string, value: string, onChange: (v: string) => void) => (
    <input
      type="number"
      min={0}
      step={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} w-12 py-1 text-center`}
      aria-label={`${label} score`}
    />
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {pairSelect(team1Name, team1PairKey, setTeam1PairKey, team1Pairs)}
        {scoreInput(team1Name, team1Score, setTeam1Score)}
        <span className="text-black/40 dark:text-white/40">–</span>
        {scoreInput(team2Name, team2Score, setTeam2Score)}
        {pairSelect(team2Name, team2PairKey, setTeam2PairKey, team2Pairs)}
        <div className="ml-auto flex items-center gap-1.5">
          {hasSavedData && (
            <button type="button" disabled={busy !== null} onClick={handleClear} className={`${buttonSecondary} px-2 py-1 text-xs`}>
              {busy === "clear" ? "Clearing…" : "Clear"}
            </button>
          )}
          <button type="button" disabled={!canSave || busy !== null} onClick={handleSave} className={`${buttonPrimary} px-2 py-1 text-xs`}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {tied && <p className="text-xs text-red-600 dark:text-red-400">A game can&apos;t end in a tie</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** How many of these matches' games have no score yet — the count a tab's
 * badge shows, so a scorer can see which tab still needs attention without
 * opening it. */
function unscoredCount(ms: ScoringMatchView[]): number {
  return ms.reduce((sum, m) => sum + m.games.filter((g) => g.team1Score === null).length, 0);
}

function TabCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 text-[10px] opacity-70 tabular-nums" aria-label={`${count} game${count === 1 ? "" : "s"} unscored`}>
      {count}
    </span>
  );
}

function MatchCard({
  tournamentId,
  eventId,
  match,
}: {
  tournamentId: string;
  eventId: string;
  match: ScoringMatchView;
}) {
  const scoredCount = match.games.filter((g) => g.team1Score !== null).length;
  return (
    // Collapsed by default on page load — an incomplete match no longer
    // auto-opens, since that also snapped it shut again mid-refresh the
    // moment it became fully scored, right after a scorer just used it.
    <details className={`${card} px-3 py-2`}>
      <summary className="cursor-pointer select-none flex items-center justify-between gap-4 text-sm font-medium">
        <span>
          {match.team1Name} vs {match.team2Name}
        </span>
        <span className="text-xs text-black/50 dark:text-white/50">
          {match.court ? `${match.court} · ` : ""}
          {scoredCount}/{match.games.length} scored
        </span>
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <p className="text-xs text-black/40 dark:text-white/40">
          Score is optional — save the players now and add it once the game finishes.
        </p>
        {match.games.map((g) => (
          <div key={g.id} className="flex items-start gap-2">
            <span className="text-xs text-black/40 dark:text-white/40 w-4 pt-1.5 shrink-0">{g.gameNumber}</span>
            <GameRow
              // Remounts (resetting GameRow's local edit state to the
              // server's latest values) only when what's actually persisted
              // for this game changes — e.g. another scorer just saved it —
              // not on every keystroke, which never touches these props.
              key={`${g.id}:${g.team1Player1Id}:${g.team1Player2Id}:${g.team2Player1Id}:${g.team2Player2Id}:${g.team1Score}:${g.team2Score}`}
              tournamentId={tournamentId}
              eventId={eventId}
              game={g}
              team1Name={match.team1Name}
              team2Name={match.team2Name}
              team1Roster={match.team1Roster}
              team2Roster={match.team2Roster}
            />
          </div>
        ))}
      </div>
    </details>
  );
}

/** A match's games, expandable — the courtside scoring console, one tab per
 * group so a scorer at a group's courts isn't scrolling past every other
 * group's matches. Live-updates (via usePickleballLive) so two scorers
 * entering games concurrently see each other's saves without a manual
 * reload. */
export function PickleballScoreBoard({
  tournamentId,
  eventId,
  matches,
}: {
  tournamentId: string;
  eventId: string;
  matches: ScoringMatchView[];
}) {
  const router = useRouter();
  const { connected } = usePickleballLive({ eventId }, () => router.refresh());
  // First-appearance order, same convention as computeStandings/PickleballStandings.
  const groups = [...new Set(matches.map((m) => m.group))];
  const [selectedGroup, setSelectedGroup] = useState(groups[0] ?? "");
  const activeGroup = groups.includes(selectedGroup) ? selectedGroup : groups[0];

  const groupMatches = matches.filter((m) => m.group === activeGroup);
  const rounds = [...new Set(groupMatches.map((m) => m.round))];
  // Kept as one piece of state (not per group) so a round shared across
  // groups — the usual case, every group plays "Round 1" the same day —
  // stays selected when switching groups; falls back to that group's first
  // round otherwise, same pattern as activeGroup above.
  const [selectedRound, setSelectedRound] = useState(rounds[0] ?? "");
  const activeRound = rounds.includes(selectedRound) ? selectedRound : rounds[0];

  const roundMatches = groupMatches.filter((m) => m.round === activeRound);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-black/50 dark:text-white/50">{connected ? "Live" : "Connecting…"}</p>

      {groups.length > 1 && (
        <div role="tablist" aria-label="Groups" className={tabsTrack}>
          {groups.map((group) => (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={group === activeGroup}
              onClick={() => setSelectedGroup(group)}
              className={tabItem(group === activeGroup)}
            >
              Group {group}
              <TabCountBadge count={unscoredCount(matches.filter((m) => m.group === group))} />
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel" aria-label={`Group ${activeGroup}`} className="flex flex-col gap-3">
        {rounds.length > 1 && (
          <div role="tablist" aria-label="Rounds" className={tabsTrack}>
            {rounds.map((round) => (
              <button
                key={round}
                type="button"
                role="tab"
                aria-selected={round === activeRound}
                onClick={() => setSelectedRound(round)}
                className={tabItem(round === activeRound)}
              >
                Round {round}
                <TabCountBadge count={unscoredCount(groupMatches.filter((m) => m.round === round))} />
              </button>
            ))}
          </div>
        )}

        <div role="tabpanel" aria-label={`Round ${activeRound}`} className="flex flex-col gap-2">
          {roundMatches.map((m) => (
            <MatchCard key={m.id} tournamentId={tournamentId} eventId={eventId} match={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
