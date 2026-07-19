"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAuctionAction } from "@/lib/actions/auction.actions";
import { card, buttonPrimary, inputClass } from "@/lib/ui";

type Player = {
  id: string;
  name: string;
  position: string | null;
  defaultCategory: string | null;
};
type Category = { name: string; basePrice: string };

export function NewAuctionForm({
  tournamentId,
  players,
}: {
  tournamentId: string;
  players: Player[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [teamBudget, setTeamBudget] = useState("");
  const [categories, setCategories] = useState<Category[]>([{ name: "", basePrice: "" }]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [overridden, setOverridden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const categoryNames = categories.map((c) => c.name.trim()).filter(Boolean);

  // Pre-fill each player's category from their roster default as soon as a
  // matching category is defined, unless the admin has manually overridden it.
  useEffect(() => {
    setAssignments((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of players) {
        if (overridden.has(p.id) || !p.defaultCategory) continue;
        if (categoryNames.includes(p.defaultCategory) && next[p.id] !== p.defaultCategory) {
          next[p.id] = p.defaultCategory;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryNames.join("|")]);

  function assignPlayer(playerId: string, categoryName: string) {
    setOverridden((prev) => new Set(prev).add(playerId));
    setAssignments((prev) => ({ ...prev, [playerId]: categoryName }));
  }

  function updateCategory(index: number, field: keyof Category, value: string) {
    setCategories((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  }

  function addCategory() {
    setCategories((prev) => [...prev, { name: "", basePrice: "" }]);
  }

  function removeCategory(index: number) {
    const removedName = categories[index].name.trim();
    setCategories((prev) => prev.filter((_, i) => i !== index));
    setAssignments((prev) => {
      const next = { ...prev };
      for (const [playerId, catName] of Object.entries(next)) {
        if (catName === removedName) delete next[playerId];
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const playerAssignments = Object.entries(assignments)
      .filter(([, categoryName]) => categoryName)
      .map(([playerId, categoryName]) => ({ playerId, categoryName }));

    if (playerAssignments.length === 0) {
      setError("Assign at least one player to a category.");
      return;
    }

    setLoading(true);
    try {
      const result = await createAuctionAction({
        tournamentId,
        name,
        teamBudget: Number(teamBudget),
        categories: categories
          .filter((c) => c.name.trim())
          .map((c) => ({ name: c.name.trim(), basePrice: Number(c.basePrice) })),
        playerAssignments,
      });
      router.push(`/admin/auctions/${result.auctionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create auction");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <label className="flex flex-col gap-1 text-sm max-w-sm">
        Auction name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm max-w-sm">
        Team budget
        <input
          required
          type="number"
          min={1}
          step="0.01"
          value={teamBudget}
          onChange={(e) => setTeamBudget(e.target.value)}
          className={inputClass}
        />
      </label>

      <div>
        <h2 className="text-sm font-medium mb-2">Categories &amp; base prices</h2>
        <div className="flex flex-col gap-2">
          {categories.map((cat, i) => (
            <div key={i} className="flex gap-2 items-center max-w-md">
              <input
                placeholder="Category name (e.g. Icon)"
                value={cat.name}
                onChange={(e) => updateCategory(i, "name", e.target.value)}
                className={`${inputClass} flex-1`}
              />
              <input
                placeholder="Base price"
                type="number"
                min={1}
                step="0.01"
                value={cat.basePrice}
                onChange={(e) => updateCategory(i, "basePrice", e.target.value)}
                className={`${inputClass} w-32`}
              />
              {categories.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCategory(i)}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addCategory}
            className="self-start text-sm underline underline-offset-2"
          >
            + Add category
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-2">
          Player pool ({players.length} in roster)
        </h2>
        <p className="text-xs text-black/50 dark:text-white/50 mb-2">
          Categories are pre-filled from each player&apos;s default category once you&apos;ve
          created a matching category below — override any player individually as needed.
        </p>
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pl-4 pr-4">Player</th>
                <th className="py-2 pr-4">Position</th>
                <th className="py-2 pr-4">Default category</th>
                <th className="py-2 pr-4">Category</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                  <td className="py-2 pl-4 pr-4">{p.name}</td>
                  <td className="py-2 pr-4">{p.position ?? "—"}</td>
                  <td className="py-2 pr-4">{p.defaultCategory ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <select
                      value={assignments[p.id] ?? ""}
                      onChange={(e) => assignPlayer(p.id, e.target.value)}
                      className={`${inputClass} py-1`}
                    >
                      <option value="">— Exclude —</option>
                      {categoryNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={loading} className={`${buttonPrimary} self-start`}>
        {loading ? "Creating…" : "Create auction"}
      </button>
    </form>
  );
}
