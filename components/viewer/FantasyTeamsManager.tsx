"use client";

import { useState } from "react";
import { FantasyTeamForm } from "@/components/viewer/FantasyTeamForm";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { deleteMyFantasyTeamAction } from "@/lib/actions/fantasyTeam.actions";
import { tabsTrack, tabItem } from "@/lib/ui";

export type MyFantasyTeam = { id: string; name: string | null; picks: string[] };

type PlayerOption = React.ComponentProps<typeof FantasyTeamForm>["players"][number];

/**
 * Tabs across a viewer's own fantasy teams for one auction (create
 * additional ones up to the auction's cap, switch between them, edit/delete
 * each) — replaces what used to be a single form bound to "the" team, now
 * that Auction.fantasyMaxTeamsPerUser can be greater than 1.
 *
 * Deliberately holds no independent copy of the team list — `initialTeams`
 * (freshly re-fetched by the server component parent after every
 * `router.refresh()` a save/delete triggers) stays the single source of
 * truth for team content; only `activeTeamId`/`creatingNew` (pure
 * navigation state, not data) live in local state, so there's nothing to
 * keep in sync by hand.
 */
export function FantasyTeamsManager({
  auctionId,
  cap,
  budget,
  players,
  lockedPlayerId,
  selfPickRequired,
  maxTeams,
  initialTeams,
}: {
  auctionId: string;
  cap: number;
  budget: string;
  players: PlayerOption[];
  lockedPlayerId: string | null;
  selfPickRequired: boolean;
  maxTeams: number;
  initialTeams: MyFantasyTeam[];
}) {
  const [activeTeamId, setActiveTeamId] = useState<string | null>(initialTeams[0]?.id ?? null);
  const [creatingNew, setCreatingNew] = useState(initialTeams.length === 0);

  // Falls back to the first remaining team if activeTeamId no longer
  // matches anything (e.g. that team was just deleted) — never a stale
  // reference to a team that no longer exists in the fresh server data.
  const activeTeam = creatingNew
    ? null
    : (initialTeams.find((t) => t.id === activeTeamId) ?? initialTeams[0] ?? null);
  const canAddAnother = initialTeams.length < maxTeams;

  return (
    <div className="flex flex-col gap-4">
      {initialTeams.length > 0 && (
        <div className={tabsTrack}>
          {initialTeams.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTeamId(t.id);
                setCreatingNew(false);
              }}
              className={tabItem(!creatingNew && activeTeam?.id === t.id)}
            >
              {t.name || `Team ${i + 1}`}
            </button>
          ))}
          {canAddAnother && (
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              className={tabItem(creatingNew)}
            >
              + Add another team
            </button>
          )}
        </div>
      )}

      {activeTeam && (
        <div className="flex justify-end">
          <ConfirmDeleteButton
            confirmMessage={`Delete "${activeTeam.name || "this team"}"? This can't be undone.`}
            action={() => deleteMyFantasyTeamAction(auctionId, activeTeam.id)}
            label="Delete this team"
          />
        </div>
      )}

      <FantasyTeamForm
        key={activeTeam?.id ?? "new"}
        auctionId={auctionId}
        cap={cap}
        budget={budget}
        players={players}
        lockedPlayerId={lockedPlayerId}
        selfPickRequired={selfPickRequired}
        fantasyTeamId={activeTeam?.id}
        initialSelected={activeTeam?.picks}
        initialName={activeTeam?.name ?? undefined}
        onSaved={(team) => {
          setActiveTeamId(team.id);
          setCreatingNew(false);
        }}
      />
    </div>
  );
}
