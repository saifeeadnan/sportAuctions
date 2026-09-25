"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publishStatsUploadAction } from "@/lib/actions/tournamentStats.actions";
import { buttonSecondary } from "@/lib/ui";

/** Makes one upload the league's public statistics. Says plainly what becomes visible before doing it. */
export function PublishStatsButton({
  leagueId,
  uploadId,
  sheetNames,
  hasLink,
}: {
  leagueId: string;
  uploadId: string;
  sheetNames: string[];
  /** The league already has a public link, so publishing swaps what it shows. */
  hasLink: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    const list = sheetNames.join(", ");
    const message = hasLink
      ? `Publish this upload? The public link stays the same but will show its ${sheetNames.length} sheet(s) (${list}) to anyone who has it.`
      : `Publish this upload? Its ${sheetNames.length} sheet(s) (${list}) will be visible to anyone with the public link, without logging in.`;
    if (!window.confirm(message)) return;
    setLoading(true);
    setError(null);
    const result = await publishStatsUploadAction(leagueId, uploadId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handlePublish}
        disabled={loading}
        className={`${buttonSecondary} px-2 py-1 text-xs`}
      >
        {loading ? "Publishing…" : "Publish"}
      </button>
      {error && <span className="text-xs text-red-600 max-w-[16rem] text-right">{error}</span>}
    </div>
  );
}
