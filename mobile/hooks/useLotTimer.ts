import { useEffect, useState } from "react";

/** Ported from the web app's hooks/useLotTimer.ts (verbatim logic — a real
 * `react` import means it can't be cross-root-imported, see the mobile
 * useAuctionSocket/useBidTiming hooks for the same reasoning). Purely
 * cosmetic countdown against the server-driven lotTimerDeadline. */
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
