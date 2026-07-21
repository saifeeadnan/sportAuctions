"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAuctionAction } from "@/lib/actions/auction.actions";
import { card, buttonPrimary, inputClass, tabsTrack, tabItem } from "@/lib/ui";
import {
  AUCTION_TYPES,
  AUCTION_TYPE_LABELS,
  IMPLEMENTED_AUCTION_TYPES,
  type AuctionType,
} from "@/lib/auctionTypes";

type Player = {
  id: string;
  name: string;
  position: string | null;
  defaultCategory: string | null;
};
type Category = { name: string; basePrice: string; preAuctionEligible: boolean };

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
  const [auctionType, setAuctionType] = useState<AuctionType>("LIVE");
  const [categories, setCategories] = useState<Category[]>([
    { name: "", basePrice: "", preAuctionEligible: true },
  ]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [overridden, setOverridden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");

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

  useEffect(() => {
    if (
      activeFilter !== "All" &&
      activeFilter !== "Unassigned" &&
      !categoryNames.includes(activeFilter)
    ) {
      setActiveFilter("All");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryNames.join("|")]);

  const auctionTypeUnsupported = !IMPLEMENTED_AUCTION_TYPES.includes(auctionType);

  const filterOptions = ["All", ...categoryNames, "Unassigned"];
  const visiblePlayers = players.filter((p) => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Unassigned") return !assignments[p.id];
    return assignments[p.id] === activeFilter;
  });

  function assignPlayer(playerId: string, categoryName: string) {
    setOverridden((prev) => new Set(prev).add(playerId));
    setAssignments((prev) => ({ ...prev, [playerId]: categoryName }));
  }

  function updateCategory(index: number, field: "name" | "basePrice", value: string) {
    setCategories((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  }

  function toggleCategoryPreAuctionEligible(index: number) {
    setCategories((prev) =>
      prev.map((c, i) =>
        i === index ? { ...c, preAuctionEligible: !c.preAuctionEligible } : c
      )
    );
  }

  function addCategory() {
    setCategories((prev) => [...prev, { name: "", basePrice: "", preAuctionEligible: true }]);
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
        auctionType,
        categories: categories
          .filter((c) => c.name.trim())
          .map((c) => ({
            name: c.name.trim(),
            basePrice: Number(c.basePrice),
            preAuctionEligible: c.preAuctionEligible,
          })),
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className={`${card} p-4 grid gap-4 sm:grid-cols-2`}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Auction name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
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

          <label className="flex flex-col gap-1 text-sm">
            Auction type
            <select
              value={auctionType}
              onChange={(e) => setAuctionType(e.target.value as AuctionType)}
              className={inputClass}
            >
              {AUCTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {AUCTION_TYPE_LABELS[type]}
                  {IMPLEMENTED_AUCTION_TYPES.includes(type) ? "" : " (coming soon)"}
                </option>
              ))}
            </select>
            {auctionTypeUnsupported && (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                {AUCTION_TYPE_LABELS[auctionType]} isn&apos;t implemented yet — switch to Live
                Auction to continue.
              </span>
            )}
          </label>
        </div>

        <div>
          <h2 className="text-sm font-medium mb-2">Categories &amp; base prices</h2>
          <div className="flex flex-col gap-2">
            {categories.map((cat, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex gap-2 items-center">
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
                    className={`${inputClass} w-28`}
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
                <label
                  className="flex items-center gap-1.5 text-xs text-black/60 dark:text-white/60"
                  title="If unchecked, players in this category can only be won through live bidding, not the pre-auction draft"
                >
                  <input
                    type="checkbox"
                    checked={cat.preAuctionEligible}
                    onChange={() => toggleCategoryPreAuctionEligible(i)}
                  />
                  Allow pre-auction draft picks
                </label>
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
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h2 className="text-sm font-medium">Player pool ({players.length})</h2>
          <div className={tabsTrack}>
            {filterOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setActiveFilter(opt)}
                className={tabItem(activeFilter === opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className={`${card} overflow-hidden`}>
          <div className="max-h-[380px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10 sticky top-0 bg-white/95 dark:bg-black/70 backdrop-blur-sm">
                  <th className="py-2 pl-4 pr-4">Player</th>
                  <th className="py-2 pr-4">Position</th>
                  <th className="py-2 pr-4">Category</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlayers.map((p) => (
                  <tr key={p.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-1.5 pl-4 pr-4">{p.name}</td>
                    <td className="py-1.5 pr-4">{p.position ?? "—"}</td>
                    <td className="py-1.5 pr-4">
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
                {visiblePlayers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-black/50 dark:text-white/50">
                      No players in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading || auctionTypeUnsupported}
        className={`${buttonPrimary} self-start`}
      >
        {loading ? "Creating…" : "Create auction"}
      </button>
    </form>
  );
}
