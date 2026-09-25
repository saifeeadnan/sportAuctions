import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolveAdminScope } from "@/lib/auth/scope";
import {
  getStatsShare,
  getStatsUploadForAdmin,
  listStatsUploads,
} from "@/lib/services/tournamentStats.service";
import { UploadStatsForm } from "@/components/admin/UploadStatsForm";
import { StatsUploadHistory } from "@/components/admin/StatsUploadHistory";
import { StatsSharePanel } from "@/components/admin/StatsSharePanel";
import { StatsSettingsPanel } from "@/components/admin/StatsSettingsPanel";
import { MY_STATS_LANDING, MY_STATS_TAB } from "@/lib/statsPublish";
import { buildPlayerIndex } from "@/lib/statsPlayerView";
import { SheetTabs } from "@/components/stats/SheetTabs";
import { formatDateTime } from "@/lib/dates";
import { card, cardInteractive } from "@/lib/ui";

export default async function TournamentAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; upload?: string; player?: string; vs?: string }>;
}) {
  const { league: selectedLeagueId, upload: requestedUploadId, player, vs } = await searchParams;
  const { leagueIds } = await resolveAdminScope(selectedLeagueId);
  // Statistics belong to one league, so this page needs exactly one — the
  // sidebar's filter, or a League Admin's only league. Otherwise ask.
  const leagueId = leagueIds?.length === 1 ? leagueIds[0] : undefined;

  const intro = (
    <>
      <h1 className="text-xl font-semibold mb-1">Tournament Analysis</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Upload a workbook of tournament statistics, choose which sheets to load, and share the result with a public link.
      </p>
    </>
  );

  if (!leagueId) {
    const leagues = await prisma.league.findMany({
      where: leagueIds ? { id: { in: leagueIds } } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return (
      <div>
        <div className="mb-6">{intro}</div>
        {leagues.length === 0 ? (
          <p className="text-black/60 dark:text-white/60">No leagues yet.</p>
        ) : (
          <>
            <p className="text-sm text-black/60 dark:text-white/60 mb-3">Pick a league:</p>
            <ul className="flex flex-col gap-2">
              {leagues.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/tournament-analysis?league=${l.id}`} className={`${cardInteractive} block px-4 py-3`}>
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  const [uploads, share] = await Promise.all([listStatsUploads(leagueId), getStatsShare(leagueId)]);
  // What the tabs below show: the one asked for, else the published one, else the newest.
  const selectedId =
    uploads.find((u) => u.id === requestedUploadId)?.id ?? share?.uploadId ?? uploads[0]?.id ?? null;
  const selected = selectedId ? await getStatsUploadForAdmin(leagueId, selectedId) : null;
  const published = uploads.find((u) => u.isPublished);

  // The preview is exactly what visitors get: the admin's tab names and order, hidden columns already cut.
  const tabNameOf = (s: { name: string; label: string | null }) => s.label?.trim() || s.name;
  const tabs = selected?.sheets.map((s) => ({ name: tabNameOf(s), sections: s.sections })) ?? [];
  const hasMyStats = buildPlayerIndex(tabs).names.length > 0;
  const landingSheet = selected?.sheets.find((s) => s.name === selected.landingTab);
  const landing = selected?.landingTab === MY_STATS_LANDING ? MY_STATS_TAB : landingSheet ? tabNameOf(landingSheet) : null;
  // The public address My stats links and images point at — only once this upload is what the public link shows.
  const sharePath = selected?.isPublished && share ? `/stats/${share.token}` : null;

  return (
    <div data-wide className="flex flex-col gap-6">
      <div>{intro}</div>

      <details className={card} open={uploads.length === 0}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">Upload workbook</summary>
        <UploadStatsForm leagueId={leagueId} />
      </details>

      <StatsSharePanel
        leagueId={leagueId}
        token={share?.token ?? null}
        publishedName={published ? (published.label ?? published.fileName) : null}
      />

      <StatsUploadHistory
        leagueId={leagueId}
        uploads={uploads}
        selectedUploadId={selectedId}
        hasLink={share !== null}
        leagueParam={selectedLeagueId}
      />

      {selected && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-medium">{selected.label ?? selected.fileName}</h2>
            <p className="text-xs text-black/50 dark:text-white/50">
              Uploaded {formatDateTime(selected.uploadedAt)} · {selected.sheets.length} sheet
              {selected.sheets.length === 1 ? "" : "s"}
              {selected.isPublished ? " · this is what the public link shows" : " · not published"}
            </p>
          </div>
          <StatsSettingsPanel
            key={selected.id}
            leagueId={leagueId}
            uploadId={selected.id}
            landingTab={selected.landingTab}
            hasMyStats={hasMyStats}
            sheets={selected.sheets.map((s) => ({ name: s.name, label: s.label, hiddenColumns: s.hiddenColumns, headings: s.headings }))}
          />
          {/* keyed by the settings too, so saving a new order or name rebuilds the tabs */}
          <SheetTabs
            key={`${selected.id}:${tabs.map((t) => t.name).join("|")}:${selected.sheets.map((s) => s.hiddenColumns.join(",")).join("|")}`}
            sheets={tabs}
            landing={landing}
            sharePath={sharePath}
            initialPlayer={player || null}
            initialCompare={vs || null}
          />
        </section>
      )}
    </div>
  );
}
