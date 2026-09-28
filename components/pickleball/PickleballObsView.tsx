"use client";

import { useState } from "react";
import { usePickleballLive } from "@/hooks/usePickleballLive";
import type { PublicPickleballEvent } from "@/lib/services/pickleballEvent.service";

/**
 * OBS-canvas-friendly standings and latest results — dark and full-bleed,
 * meant to be dropped into OBS Studio as a browser source. Deliberately
 * hardcodes dark colors rather than using `dark:` variants (which follow the
 * viewer's OS preference): an OBS canvas must render the same regardless of
 * whatever machine is running the browser source. Live-updates by fetching
 * the public JSON state route on every socket ping (see
 * hooks/usePickleballLive.ts) instead of a page refresh, which would
 * flash/flicker as a navigation — same reasoning as
 * components/auction/BroadcastAuctionView.tsx.
 */
export function PickleballObsView({ token, initial }: { token: string; initial: PublicPickleballEvent }) {
  const [state, setState] = useState(initial);

  async function refetch() {
    try {
      const res = await fetch(`/api/pickleball/${token}/state`, { cache: "no-store" });
      if (!res.ok) return;
      setState(await res.json());
    } catch {
      // A transient network blip — the next ping (or socket reconnect) will catch up.
    }
  }
  usePickleballLive({ token }, refetch);

  const groups = [...new Set(state.standings.map((r) => r.group))];
  const recentResults = state.matches.filter((m) => m.result.isDecided).slice(-6).reverse();

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white flex flex-col gap-6 p-8">
      <header className="flex items-center gap-4">
        {state.hasLeagueLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/leagues/${state.leagueId}/logo`}
            alt={`${state.leagueName} logo`}
            className="h-16 w-16 rounded object-contain bg-white/10 border border-white/10 p-1 shrink-0"
          />
        )}
        <h1 className="text-3xl font-bold">{state.leagueName}</h1>
      </header>

      <div className={`grid gap-8 ${groups.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {groups.map((group) => (
          <section key={group} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-white/80">Group {group}</h2>
            <table className="w-full text-lg border-collapse">
              <thead>
                <tr className="border-b border-white/20 text-left text-sm text-white/50">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-2 font-medium">Team</th>
                  <th className="py-2 pr-2 font-medium text-right">W-L</th>
                  <th className="py-2 pr-2 font-medium text-right">Games</th>
                  <th className="py-2 font-medium text-right">Diff</th>
                </tr>
              </thead>
              <tbody>
                {state.standings
                  .filter((r) => r.group === group)
                  .map((r) => (
                    <tr key={r.teamId} className="border-b border-white/10">
                      <td className="py-2 pr-2 tabular-nums text-white/70">{r.rank}</td>
                      <td className="py-2 pr-2 font-medium">{r.teamName}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {r.matchWins}-{r.matchLosses}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-white/70">
                        {r.gamesWon}-{r.gamesLost}
                      </td>
                      <td className="py-2 text-right tabular-nums text-white/70">
                        {r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      {recentResults.length > 0 && (
        <footer className="mt-auto flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70 border-t border-white/10 pt-4">
          {recentResults.map((m) => (
            <span key={m.id} className="tabular-nums">
              {m.team1Name} {m.result.team1GamesWon}–{m.result.team2GamesWon} {m.team2Name}
            </span>
          ))}
        </footer>
      )}
    </div>
  );
}
