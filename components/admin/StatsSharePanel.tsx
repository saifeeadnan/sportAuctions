"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rotateStatsLinkAction, stopSharingStatsAction } from "@/lib/actions/tournamentStats.actions";
import { CopyInviteLinkButton } from "@/components/admin/CopyInviteLinkButton";
import { buttonSecondary, card } from "@/lib/ui";

/**
 * The league's public statistics link: copy it, open it, replace it or turn it
 * off. The link is created by publishing an upload (see PublishStatsButton),
 * not here — sharing nothing has no link to show.
 */
export function StatsSharePanel({
  leagueId,
  token,
  publishedName,
}: {
  leagueId: string;
  /** Null when sharing is off. */
  token: string | null;
  /** Label (else file name) of the published upload; null when nothing is published. */
  publishedName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"stop" | "rotate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "stop" | "rotate", confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    setBusy(kind);
    setError(null);
    const result = kind === "stop" ? await stopSharingStatsAction(leagueId) : await rotateStatsLinkAction(leagueId);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className={`${card} px-4 py-3 flex flex-col gap-2`}>
      <h2 className="text-sm font-medium">Public link</h2>
      {!token ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          Not shared. Publish one of the uploads below to create a link anyone can open without logging in.
        </p>
      ) : (
        <>
          <p className="text-sm text-black/60 dark:text-white/60">
            {publishedName ? (
              <>
                Showing <span className="font-medium text-black dark:text-white">{publishedName}</span>. The link
                stays the same when you publish a different upload.
              </>
            ) : (
              "The published upload was deleted, so the link shows nothing. Publish an upload to fill it again."
            )}
          </p>
          <div className="flex items-center flex-wrap gap-2">
            <code className="rounded bg-black/5 dark:bg-white/10 px-2 py-1 text-xs break-all">/stats/{token}</code>
            <CopyInviteLinkButton path={`/stats/${token}`} label="Copy public link" />
            <a
              href={`/stats/${token}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonSecondary} px-2 py-1 text-xs`}
            >
              Open
            </a>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                run("rotate", "Replace the public link? The current link will stop working for everyone who has it.")
              }
              className={`${buttonSecondary} px-2 py-1 text-xs`}
            >
              {busy === "rotate" ? "Replacing…" : "New link"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("stop", "Stop sharing? The public link will stop working for everyone who has it.")}
              className="text-xs text-red-600 dark:text-red-400 underline underline-offset-2 disabled:opacity-50"
            >
              {busy === "stop" ? "Stopping…" : "Stop sharing"}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
