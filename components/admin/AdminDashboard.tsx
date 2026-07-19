import Link from "next/link";
import { RostersPanel } from "@/components/admin/RostersPanel";
import { TournamentsPanel } from "@/components/admin/TournamentsPanel";
import { UsersPanel, resolveRoleTab } from "@/components/admin/UsersPanel";
import { tabsTrack, tabItem } from "@/lib/ui";

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
      <h1 className="text-xl font-semibold mb-5">Admin dashboard</h1>

      <div className={`${tabsTrack} mb-6`}>
        {SECTIONS.map((s) => (
          <Link key={s} href={`/?section=${s}`} className={tabItem(activeSection === s)}>
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
