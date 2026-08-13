"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  removePlayerPostAuctionAction,
  addPlayerPostAuctionAction,
  replacePlayerPostAuctionAction,
} from "@/lib/actions/bidding.actions";
import { buttonPrimary, inputClass, selectClass } from "@/lib/ui";

type ConfirmedPlayer = {
  auctionPlayerId: string;
  playerName: string;
  categoryName: string;
  soldPrice: string | null;
};

type ReplacementCandidate = {
  playerId: string;
  playerName: string;
  /** True once this player already has an AuctionPlayer row (UNSOLD) in this
   * auction — false means they'd be added to the pool fresh, and need a
   * category chosen for them. */
  inPool: boolean;
  categoryId: string | null;
  categoryName: string | null;
};

type CategoryOption = { id: string; name: string; basePrice: string };

export function PostAuctionRosterForm({
  auctionId,
  teamAuctionEntryId,
  confirmedPlayers,
  replacementCandidates,
  categories,
}: {
  auctionId: string;
  teamAuctionEntryId: string;
  confirmedPlayers: ConfirmedPlayer[];
  replacementCandidates: ReplacementCandidate[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [outgoingId, setOutgoingId] = useState("");
  const [incomingPlayerId, setIncomingPlayerId] = useState("");
  const [incomingCategoryId, setIncomingCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const incomingCandidate = replacementCandidates.find((c) => c.playerId === incomingPlayerId);
  const needsCategoryPicker = incomingPlayerId !== "" && incomingCandidate?.inPool === false;

  function handleOutgoingChange(id: string) {
    setOutgoingId(id);
    const player = confirmedPlayers.find((p) => p.auctionPlayerId === id);
    if (player?.soldPrice) setPrice(player.soldPrice);
  }

  function handleIncomingChange(playerId: string) {
    setIncomingPlayerId(playerId);
    const candidate = replacementCandidates.find((c) => c.playerId === playerId);
    if (!candidate) {
      setIncomingCategoryId("");
      return;
    }
    if (candidate.inPool) {
      setIncomingCategoryId(candidate.categoryId ?? "");
    } else {
      setIncomingCategoryId(categories[0]?.id ?? "");
    }
    // Only auto-fill price from a category's base price for a pure add — a
    // swap defaults to the outgoing player's own price instead.
    if (!outgoingId) {
      const categoryId = candidate.inPool ? candidate.categoryId : categories[0]?.id;
      const category = categories.find((c) => c.id === categoryId);
      if (category) setPrice(category.basePrice);
    }
  }

  const action: "remove" | "add" | "replace" | null =
    outgoingId && incomingPlayerId
      ? "replace"
      : outgoingId
        ? "remove"
        : incomingPlayerId
          ? "add"
          : null;

  const canSubmit =
    action === "remove" ||
    (action !== null && !!price && (!needsCategoryPicker || !!incomingCategoryId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!action) return;
    setLoading(true);
    setError(null);

    const result =
      action === "remove"
        ? await removePlayerPostAuctionAction(auctionId, outgoingId, teamAuctionEntryId)
        : action === "add"
          ? await addPlayerPostAuctionAction(
              auctionId,
              teamAuctionEntryId,
              incomingPlayerId,
              incomingCategoryId,
              Number(price)
            )
          : await replacePlayerPostAuctionAction(
              auctionId,
              outgoingId,
              incomingPlayerId,
              incomingCategoryId,
              Number(price),
              teamAuctionEntryId
            );

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOutgoingId("");
    setIncomingPlayerId("");
    setIncomingCategoryId("");
    setPrice("");
    router.refresh();
  }

  const submitLabel =
    action === "remove"
      ? "Remove player"
      : action === "add"
        ? "Add player"
        : action === "replace"
          ? "Replace player"
          : "Save change";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        Player to remove
        <select
          value={outgoingId}
          onChange={(e) => handleOutgoingChange(e.target.value)}
          className={selectClass}
        >
          <option value="">— None (add without removing) —</option>
          {confirmedPlayers.map((p) => (
            <option key={p.auctionPlayerId} value={p.auctionPlayerId}>
              {p.playerName} ({p.categoryName}, {p.soldPrice ?? "—"})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Replacement player
        <select
          value={incomingPlayerId}
          onChange={(e) => handleIncomingChange(e.target.value)}
          className={selectClass}
        >
          <option value="">— None (remove only) —</option>
          {replacementCandidates.map((c) => (
            <option key={c.playerId} value={c.playerId}>
              {c.playerName}
              {c.inPool ? ` (${c.categoryName})` : " (not yet in this auction's pool)"}
            </option>
          ))}
        </select>
      </label>

      {needsCategoryPicker && (
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            value={incomingCategoryId}
            onChange={(e) => setIncomingCategoryId(e.target.value)}
            className={selectClass}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (base {c.basePrice})
              </option>
            ))}
          </select>
        </label>
      )}

      {action !== "remove" && action !== null && (
        <label className="flex flex-col gap-1 text-sm">
          Price
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
          />
        </label>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={loading || !canSubmit} className={`${buttonPrimary} self-start`}>
        {loading ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
