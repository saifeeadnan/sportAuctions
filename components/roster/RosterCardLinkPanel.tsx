"use client";

import { useState } from "react";
import { generateRosterCardLinkAction } from "@/lib/actions/rosterCardShare.actions";
import { CopyInviteLinkButton } from "@/components/admin/CopyInviteLinkButton";
import { buttonSecondary } from "@/lib/ui";

/** Per-team twin of HighlightsLinkPanel: mints (idempotently) and copies the
 * public /roster-card/{token} link for one team's roster in one auction.
 * Rendered for admins and for the team's own manager. */
export function RosterCardLinkPanel({
  auctionId,
  entryId,
  initialToken,
}: {
  auctionId: string;
  entryId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    const result = await generateRosterCardLinkAction(auctionId, entryId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setToken(result.data!.token);
  }

  if (token) {
    return <CopyInviteLinkButton path={`/roster-card/${token}`} label="Copy roster card link" />;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={handleCreate}
        className={`${buttonSecondary} px-2 py-1 text-xs`}
      >
        {loading ? "Creating…" : "Create roster card link"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
