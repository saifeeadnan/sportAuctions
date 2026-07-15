"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitDraftAction } from "@/lib/actions/auction.actions";

type PlayerOption = {
  id: string;
  name: string;
  position: string | null;
  categoryName: string;
  basePrice: string;
};

export function DraftForm({
  entryId,
  cap,
  players,
  initialSelected,
  lockedPlayerId,
}: {
  entryId: string;
  cap: number;
  players: PlayerOption[];
  initialSelected: string[];
  lockedPlayerId?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(lockedPlayerId ? [...initialSelected, lockedPlayerId] : initialSelected)
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(id: string) {
    if (id === lockedPlayerId) return;
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= cap) return prev;
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      await submitDraftAction(entryId, Array.from(selected));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit draft");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Selected {selected.size}/{cap}
      </p>

      <ul className="flex flex-col gap-1">
        {players.map((p) => {
          const isLocked = p.id === lockedPlayerId;
          return (
            <li key={p.id}>
              <label className="flex items-center gap-2 text-sm rounded border border-black/10 dark:border-white/10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  disabled={isLocked || (!selected.has(p.id) && selected.size >= cap)}
                />
                <span className="flex-1">
                  {p.name} {p.position ? `(${p.position})` : ""}
                  {isLocked ? " — you (locked in)" : ""}
                </span>
                <span className="text-black/60 dark:text-white/60">
                  {p.categoryName} &middot; base {p.basePrice}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Draft submitted.</p>}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="self-start rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Submitting…" : "Submit draft"}
      </button>
    </div>
  );
}
