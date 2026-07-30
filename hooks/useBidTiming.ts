"use client";

import { useEffect, useState } from "react";

/** Shared timing/amount math for any bid-placing control — the countdown
 * ticks locally (re-rendering every 500ms) while the actual cooldown
 * deadline and current bid always come from the server-driven player state. */
export function useBidTiming(player: {
  currentBid: string | null;
  basePrice: string;
  bidIncrement: string | null;
  bidCooldownUntil: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  const currentBid = player.currentBid != null ? Number(player.currentBid) : null;
  const basePrice = Number(player.basePrice);
  const increment = player.bidIncrement != null ? Number(player.bidIncrement) : null;
  const cooldownMs = player.bidCooldownUntil ? new Date(player.bidCooldownUntil).getTime() - now : 0;
  const onCooldown = cooldownMs > 0;
  const minNext = currentBid == null ? basePrice : increment != null ? currentBid + increment : currentBid;

  return { currentBid, basePrice, increment, cooldownMs, onCooldown, minNext };
}
