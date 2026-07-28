"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 45_000;

export function AnalyticsHeartbeat() {
  useEffect(() => {
    function ping() {
      if (document.visibilityState !== "visible") return;
      fetch("/api/analytics/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    }

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  return null;
}
