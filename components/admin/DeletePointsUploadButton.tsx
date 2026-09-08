"use client";

import { adminDeletePointsUploadAction } from "@/lib/actions/fantasyTeam.actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

export function DeletePointsUploadButton({
  auctionId,
  uploadId,
  when,
  isLatest,
  isOnly,
}: {
  auctionId: string;
  uploadId: string;
  /** Already-formatted upload time, for the confirm prompt. */
  when: string;
  isLatest: boolean;
  isOnly: boolean;
}) {
  // Spell out what deleting THIS upload does to the live standings — the
  // three cases feel very different to an admin.
  const consequence = isOnly
    ? "No uploads will remain, so every player's points will be cleared."
    : isLatest
      ? "Player points will revert to the previous upload."
      : "Current points won't change, but the standings' arrows will compare against a different previous upload.";

  return (
    <ConfirmDeleteButton
      confirmMessage={`Delete the points upload from ${when}? ${consequence} This cannot be undone.`}
      action={() => adminDeletePointsUploadAction(auctionId, uploadId)}
    />
  );
}
