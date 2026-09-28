"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  publishPickleballEventAction,
  rotatePickleballLinkAction,
  stopSharingPickleballAction,
} from "@/lib/actions/pickleballEvent.actions";
import { CopyInviteLinkButton } from "@/components/admin/CopyInviteLinkButton";
import { buttonPrimary, buttonSecondary, card } from "@/lib/ui";

/**
 * The event's public link: publish, copy it, open it, replace it, or turn it
 * off — plus a link to the OBS-canvas view of the same data. Mirrors
 * StatsSharePanel.tsx's shape.
 */
export function PickleballSharePanel({
  tournamentId,
  eventId,
  token,
  hasSchedule,
}: {
  tournamentId: string;
  eventId: string;
  /** Null when sharing is off. */
  token: string | null;
  hasSchedule: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"publish" | "stop" | "rotate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "publish" | "stop" | "rotate", confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(kind);
    setError(null);
    const result =
      kind === "publish"
        ? await publishPickleballEventAction(tournamentId, eventId)
        : kind === "stop"
          ? await stopSharingPickleballAction(tournamentId, eventId)
          : await rotatePickleballLinkAction(tournamentId, eventId);
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
        <div className="flex items-center gap-3">
          <p className="text-sm text-black/60 dark:text-white/60">
            Not shared. Publish to create a link anyone can open without logging in, showing live results and
            standings.
          </p>
          <button type="button" disabled={busy !== null || !hasSchedule} onClick={() => run("publish")} className={`${buttonPrimary} shrink-0`}>
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center flex-wrap gap-2">
            <code className="rounded bg-black/5 dark:bg-white/10 px-2 py-1 text-xs break-all">/pickleball/{token}</code>
            <CopyInviteLinkButton path={`/pickleball/${token}`} label="Copy public link" />
            <a href={`/pickleball/${token}`} target="_blank" rel="noopener noreferrer" className={`${buttonSecondary} px-2 py-1 text-xs`}>
              Open
            </a>
            <a href={`/pickleball/${token}/obs`} target="_blank" rel="noopener noreferrer" className={`${buttonSecondary} px-2 py-1 text-xs`}>
              OBS view
            </a>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("rotate", "Replace the public link? The current link will stop working for everyone who has it.")}
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
