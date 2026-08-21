"use client";

import { useEffect, useState } from "react";

/** Local countdown for the visual-only lot timer — mirrors useBidTiming's
 * pattern exactly. The deadline always comes from server-driven player
 * state (set on selectNextPlayer, reset on every placeBid); this hook just
 * ticks a local interval to recompute the remaining time. Purely cosmetic:
 * nothing here ever calls a server action. */
export function useLotTimer(player: { lotTimerDeadline: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  const deadline = player.lotTimerDeadline ? new Date(player.lotTimerDeadline).getTime() : null;
  const msRemaining = deadline != null ? Math.max(0, deadline - now) : null;
  const secondsRemaining = msRemaining != null ? Math.ceil(msRemaining / 1000) : null;
  const timeUp = msRemaining === 0;

  return { secondsRemaining, timeUp };
}
