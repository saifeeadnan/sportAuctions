"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cloneAuctionAction } from "@/lib/actions/auction.actions";
import { withLeagueParam } from "@/lib/adminNav";

export function CloneAuctionButton({
  auctionId,
  auctionName,
  leagueParam,
}: {
  auctionId: string;
  auctionName: string;
  leagueParam?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClone() {
    const name = window.prompt(
      "Name for the cloned auction? It copies this auction's settings, categories and player pool, but no sales, draft picks or team assignments.",
      `${auctionName} (copy)`
    );
    if (name === null) return;
    setLoading(true);
    setError(null);
    const result = await cloneAuctionAction(auctionId, name);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push(withLeagueParam(`/admin/auctions/${result.data!.auctionId}`, leagueParam));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClone}
        disabled={loading}
        className="text-xs underline underline-offset-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors disabled:opacity-50"
      >
        {loading ? "Cloning…" : "Clone"}
      </button>
      {error && <span className="text-xs text-red-600 max-w-[16rem] text-right">{error}</span>}
    </div>
  );
}
