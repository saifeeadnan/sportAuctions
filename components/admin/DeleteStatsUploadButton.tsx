"use client";

import { deleteStatsUploadAction } from "@/lib/actions/tournamentStats.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeleteStatsUploadButton({
  leagueId,
  uploadId,
  name,
  isPublished,
}: {
  leagueId: string;
  uploadId: string;
  /** For the confirm prompt — the label, else the file name. */
  name: string;
  isPublished: boolean;
}) {
  const consequence = isPublished
    ? "It is the published upload, so the public link will stop showing anything until you publish another."
    : "The public link is not affected.";

  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete the upload "${name}"? ${consequence} This cannot be undone.`}
      action={() => deleteStatsUploadAction(leagueId, uploadId)}
    />
  );
}
