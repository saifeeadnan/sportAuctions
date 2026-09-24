"use client";

import { useEffect } from "react";
import { ACTIVITY_EVENTS, HEARTBEAT_INTERVAL_MS, shouldSendHeartbeat } from "@/lib/analyticsActivity";

export function AnalyticsHeartbeat() {
  useEffect(() => {
    // Opening the page counts as the first interaction.
    let lastInteractionAt = Date.now();
    const markActive = () => {
      lastInteractionAt = Date.now();
    };

    function ping() {
      const visible = document.visibilityState === "visible";
      if (!shouldSendHeartbeat({ visible, lastInteractionAt, now: Date.now() })) return;
      fetch("/api/analytics/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    }

    // Switching back to the tab is itself an interaction.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") markActive();
      ping();
    }

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, markActive, { passive: true, capture: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, markActive, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
