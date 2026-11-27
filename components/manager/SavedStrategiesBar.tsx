"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveCurrentAsStrategyAction,
  loadSavedStrategyAction,
  deleteSavedStrategyAction,
  getStrategyDirtyStateAction,
} from "@/lib/actions/savedStrategy.actions";
import { card, buttonSecondary, inputClass, selectClass } from "@/lib/ui";

export type SavedStrategyOption = { id: string; name: string; updatedAt: Date };

/**
 * Always visible above the tab strip (not inside any one tab) since a saved
 * strategy spans must-haves/avoids/predictions (Wish list & Predictions tab)
 * and budget targets/rival estimates (Set Budgets tab) — no single tab is
 * its correct home. Every control here either mutates live state outright
 * (Load) or captures a point-in-time copy of it (Save) — it never tracks
 * its own draft state the way an autosaving form does.
 */
export function SavedStrategiesBar({
  teamAuctionEntryId,
  activeStrategyName,
  savedStrategies,
}: {
  teamAuctionEntryId: string;
  activeStrategyName: string | null;
  savedStrategies: SavedStrategyOption[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(savedStrategies[0]?.id ?? "");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState(activeStrategyName ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Keeps the dropdown's selection valid as the list changes (e.g. the
  // very first save populating an until-then-empty list, or the selected
  // row being deleted) without fighting a selection the user already made.
  useEffect(() => {
    if (!savedStrategies.some((s) => s.id === selectedId)) {
      setSelectedId(savedStrategies[0]?.id ?? "");
    }
  }, [savedStrategies, selectedId]);

  const selected = savedStrategies.find((s) => s.id === selectedId);

  async function handleSave() {
    const trimmed = saveName.trim();
    if (trimmed === "") {
      setError("Enter a name to save this strategy as");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    const result = await saveCurrentAsStrategyAction(teamAuctionEntryId, trimmed);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(`Saved as "${trimmed}"`);
    setShowSaveInput(false);
    router.refresh();
  }

  async function doLoad(id: string, name: string) {
    setLoading(true);
    setError(null);
    setMessage(null);
    const result = await loadSavedStrategyAction(teamAuctionEntryId, id);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(`Loaded "${name}"`);
    router.refresh();
  }

  async function handleLoad() {
    if (!selected) return;
    setError(null);

    if (selected.name === activeStrategyName) {
      const confirmed = window.confirm(
        `Reload the saved version of "${selected.name}"? This will discard your current unsaved changes.`
      );
      if (!confirmed) return;
      await doLoad(selected.id, selected.name);
      return;
    }

    setLoading(true);
    const dirtyResult = await getStrategyDirtyStateAction(teamAuctionEntryId);
    setLoading(false);
    if (dirtyResult.error) {
      setError(dirtyResult.error);
      return;
    }

    if (!dirtyResult.data!.dirty) {
      await doLoad(selected.id, selected.name);
      return;
    }

    if (activeStrategyName) {
      const confirmed = window.confirm(`Save changes to "${activeStrategyName}" before loading "${selected.name}"?`);
      if (!confirmed) return;
      setLoading(true);
      const saveResult = await saveCurrentAsStrategyAction(teamAuctionEntryId, activeStrategyName);
      setLoading(false);
      if (saveResult.error) {
        setError(saveResult.error);
        return;
      }
      await doLoad(selected.id, selected.name);
      return;
    }

    setError('You have unsaved changes and nothing saved yet — use "+ Save current as…" first, then load.');
  }

  async function handleDelete() {
    if (!selected) return;
    const confirmed = window.confirm(`Delete the saved strategy "${selected.name}"? This cannot be undone.`);
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    const result = await deleteSavedStrategyAction(teamAuctionEntryId, selected.id);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className={`${card} p-3 flex flex-col gap-2`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-black/60 dark:text-white/60 shrink-0">
          {activeStrategyName ? (
            <>
              Active strategy: <span className="font-medium text-black dark:text-white">{activeStrategyName}</span>
            </>
          ) : (
            "No saved strategy loaded"
          )}
        </span>

        {savedStrategies.length > 0 && (
          <>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loading}
              className={`${selectClass} text-xs py-1`}
            >
              {savedStrategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleLoad} disabled={loading || !selected} className={buttonSecondary}>
              Load
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading || !selected}
              className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
              title="Delete saved strategy"
            >
              Delete
            </button>
          </>
        )}

        {!showSaveInput ? (
          <button
            type="button"
            onClick={() => {
              setSaveName(activeStrategyName ?? "");
              setShowSaveInput(true);
            }}
            disabled={loading}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
          >
            + Save current as…
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Strategy name"
              maxLength={60}
              disabled={loading}
              className={`${inputClass} text-xs py-1 w-40`}
            />
            <button type="button" onClick={handleSave} disabled={loading} className={buttonSecondary}>
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowSaveInput(false)}
              disabled={loading}
              className="text-xs text-black/60 dark:text-white/60 hover:underline disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {message && !error && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
    </div>
  );
}
