import Link from "next/link";
import { RostersPanel } from "@/components/admin/RostersPanel";
import { TournamentsPanel } from "@/components/admin/TournamentsPanel";
import { UsersPanel, resolveRoleTab } from "@/components/admin/UsersPanel";

const SECTIONS = ["rosters", "tournaments", "users"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_LABELS: Record<Section, string> = {
  rosters: "Player rosters",
  tournaments: "Tournaments",
  users: "Users",
};

function resolveSection(section?: string): Section {
  return SECTIONS.includes(section as Section) ? (section as Section) : "rosters";
}

export async function AdminDashboard({
  searchParams,
}: {
  searchParams: { section?: string; role?: string };
}) {
  const activeSection = resolveSection(searchParams.section);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Admin dashboard</h1>

      <div className="flex gap-1 border-b border-black/10 dark:border-white/10 mb-6">
        {SECTIONS.map((s) => (
          <Link
            key={s}
            href={`/?section=${s}`}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${
              activeSection === s
                ? "border-black dark:border-white font-medium"
                : "border-transparent text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
            }`}
          >
            {SECTION_LABELS[s]}
          </Link>
        ))}
      </div>

      {activeSection === "rosters" && <RostersPanel />}
      {activeSection === "tournaments" && <TournamentsPanel />}
      {activeSection === "users" && (
        <UsersPanel
          activeRole={resolveRoleTab(searchParams.role)}
          roleHref={(r) => `/?section=users&role=${r}`}
        />
      )}
    </div>
  );
}
