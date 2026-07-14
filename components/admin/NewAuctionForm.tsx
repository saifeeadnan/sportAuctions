"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuctionAction } from "@/lib/actions/auction.actions";

type Player = { id: string; name: string; position: string | null };
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const categoryNames = categories.map((c) => c.name.trim()).filter(Boolean);

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
          className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
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
          className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
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
                className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent flex-1"
              />
              <input
                placeholder="Base price"
                type="number"
                min={1}
                step="0.01"
                value={cat.basePrice}
                onChange={(e) => updateCategory(i, "basePrice", e.target.value)}
                className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent w-32"
              />
              {categories.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCategory(i)}
                  className="text-sm text-red-600"
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
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-4">Position</th>
              <th className="py-2 pr-4">Category</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4">{p.name}</td>
                <td className="py-2 pr-4">{p.position ?? "—"}</td>
                <td className="py-2 pr-4">
                  <select
                    value={assignments[p.id] ?? ""}
                    onChange={(e) =>
                      setAssignments((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    className="border border-black/20 dark:border-white/20 rounded px-2 py-1 bg-transparent"
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="self-start rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create auction"}
      </button>
    </form>
  );
}
