import { card, selectClass, tabsTrack, tabItem } from "@/lib/ui";

export type WizardPlayer = {
  id: string;
  name: string;
  position: string | null;
  defaultCategory: string | null;
};

export function PlayerPoolStep({
  players,
  categoryNames,
  assignments,
  onAssignPlayer,
  activeFilter,
  onActiveFilterChange,
}: {
  players: WizardPlayer[];
  categoryNames: string[];
  assignments: Record<string, string>;
  onAssignPlayer: (playerId: string, categoryName: string) => void;
  activeFilter: string;
  onActiveFilterChange: (v: string) => void;
}) {
  const filterOptions = ["All", ...categoryNames, "Unassigned"];
  const visiblePlayers = players.filter((p) => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Unassigned") return !assignments[p.id];
    return assignments[p.id] === activeFilter;
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h2 className="text-sm font-medium">Player pool ({players.length})</h2>
        <div className={tabsTrack}>
          {filterOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onActiveFilterChange(opt)}
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
                      onChange={(e) => onAssignPlayer(p.id, e.target.value)}
                      className={`${selectClass} py-1`}
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
  );
}
