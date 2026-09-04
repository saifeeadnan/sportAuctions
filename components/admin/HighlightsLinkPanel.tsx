"use client";

import { useState } from "react";
import { generateHighlightsLinkAction } from "@/lib/actions/auctionHighlights.actions";
import { CopyInviteLinkButton } from "@/components/admin/CopyInviteLinkButton";
import { buttonSecondary } from "@/lib/ui";

export function HighlightsLinkPanel({
  auctionId,
  initialToken,
}: {
  auctionId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    const result = await generateHighlightsLinkAction(auctionId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setToken(result.data!.token);
  }

  if (token) {
    return <CopyInviteLinkButton path={`/highlights/${token}`} label="Copy highlights link" />;
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={loading} onClick={handleCreate} className={buttonSecondary}>
        {loading ? "Creating…" : "Create highlights link"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
