import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { DeleteStatsUploadButton } from "@/components/admin/DeleteStatsUploadButton";
import { PublishStatsButton } from "@/components/admin/PublishStatsButton";
import { withLeagueParam } from "@/lib/adminNav";
import { formatDateTime } from "@/lib/dates";
import { card } from "@/lib/ui";
import type { StatsUploadSummary } from "@/lib/services/tournamentStats.service";

/** Every uploaded workbook for the league, newest first, with view / download / publish / delete per row. */
export function StatsUploadHistory({
  leagueId,
  uploads,
  selectedUploadId,
  hasLink,
  leagueParam,
}: {
  leagueId: string;
  uploads: StatsUploadSummary[];
  selectedUploadId: string | null;
  hasLink: boolean;
  /** The sidebar's ?league= filter, carried onto the "View" links. */
  leagueParam?: string;
}) {
  if (uploads.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-medium">Uploads ({uploads.length})</h2>
        <p className="text-xs text-black/50 dark:text-white/50">
          Newest first. Only the published upload is visible through the public link.
        </p>
      </div>
      <div className={card}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pl-4 pr-4">When</th>
              <th className="py-2 pr-4">Upload</th>
              <th className="py-2 pr-4">By</th>
              <th className="py-2 pr-4">Sheets</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {uploads.map((u) => {
              const name = u.label ?? u.fileName;
              return (
                <tr
                  key={u.id}
                  className={`border-b border-black/5 dark:border-white/5 last:border-0 ${
                    u.id === selectedUploadId ? "bg-black/[0.03] dark:bg-white/[0.04]" : ""
                  }`}
                >
                  <td className="py-2 pl-4 pr-4 align-top">
                    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                      {formatDateTime(u.uploadedAt)}
                      {u.isPublished && <Badge variant="success">Published</Badge>}
                    </span>
                  </td>
                  <td className="py-2 pr-4 align-top break-words [overflow-wrap:anywhere]">
                    <div className="font-medium">{name}</div>
                    {u.label && <div className="text-xs text-black/50 dark:text-white/50">{u.fileName}</div>}
                  </td>
                  <td className="py-2 pr-4 align-top">
                    {u.uploadedBy?.name ?? <span className="text-black/40 dark:text-white/40">—</span>}
                  </td>
                  <td className="py-2 pr-4 align-top max-w-xs break-words" title={u.sheets.map((s) => s.name).join(", ")}>
                    <span className="line-clamp-2">{u.sheets.map((s) => s.name).join(", ")}</span>
                  </td>
                  <td className="py-2 pr-4 align-top">
                    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                      {u.id !== selectedUploadId && (
                        <Link
                          href={withLeagueParam(`/admin/tournament-analysis?upload=${u.id}`, leagueParam)}
                          className="text-xs underline underline-offset-2"
                        >
                          View
                        </Link>
                      )}
                      <a
                        href={`/api/leagues/${leagueId}/tournament-stats/${u.id}/download`}
                        className="text-xs underline underline-offset-2"
                        title="Download the original file, exactly as uploaded"
                      >
                        Download
                      </a>
                      {!u.isPublished && (
                        <PublishStatsButton
                          leagueId={leagueId}
                          uploadId={u.id}
                          sheetNames={u.sheets.map((s) => s.name)}
                          hasLink={hasLink}
                        />
                      )}
                      <DeleteStatsUploadButton leagueId={leagueId} uploadId={u.id} name={name} isPublished={u.isPublished} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
