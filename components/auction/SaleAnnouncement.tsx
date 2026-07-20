"use client";

import { useEffect, useState } from "react";
import type { SaleAnnouncement as SaleAnnouncementData } from "@/hooks/useAuctionSocket";

export function SaleAnnouncement({ sale }: { sale: SaleAnnouncementData | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!sale) return;
    setVisible(true);
    const timeout = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(timeout);
  }, [sale?.id]);

  if (!sale) return null;

  return (
    <div
      aria-live="polite"
      className={`fixed top-20 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-white dark:bg-neutral-900 px-4 py-3 shadow-lg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm">
          <span className="font-semibold">{sale.teamName}</span> wins{" "}
          <span className="font-semibold">{sale.playerName}</span> for{" "}
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {sale.price}
          </span>
        </p>
      </div>
    </div>
  );
}
