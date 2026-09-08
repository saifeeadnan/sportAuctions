import { Badge } from "@/components/ui/Badge";
import { DeletePointsUploadButton } from "@/components/admin/DeletePointsUploadButton";
import { formatDateTime } from "@/lib/dates";
import { card } from "@/lib/ui";
import type { PointsUploadSummary } from "@/lib/services/fantasyPointsUpload.service";

/** Every points upload for an auction, newest first, with a delete control
 * per row. Standings always reflect the newest upload; the ▲/▼ arrows compare
 * it against the one before. */
export function PointsUploadHistory({
  auctionId,
  uploads,
}: {
  auctionId: string;
  uploads: PointsUploadSummary[];
}) {
  if (uploads.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-medium">Points uploads ({uploads.length})</h2>
        <p className="text-xs text-black/50 dark:text-white/50">
          Newest first. Standings reflect the newest upload; deleting it reverts to the one before.
        </p>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pl-4 pr-4">When</th>
              <th className="py-2 pr-4">Label</th>
              <th className="py-2 pr-4">By</th>
              <th className="py-2 pr-4">Players</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {uploads.map((u, i) => (
              <tr key={u.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                <td className="py-2 pl-4 pr-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    {formatDateTime(u.uploadedAt)}
                    {i === 0 && <Badge variant="success">Latest</Badge>}
                  </span>
                </td>
                <td className="py-2 pr-4">{u.label ?? <span className="text-black/40 dark:text-white/40">—</span>}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {u.uploadedBy?.name ?? <span className="text-black/40 dark:text-white/40">—</span>}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap" title={`${u.rowCount} CSV row(s) applied`}>
                  {u.playerCount}
                  {u.rowCount !== u.playerCount && (
                    <span className="text-black/40 dark:text-white/40"> ({u.rowCount} in file)</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center justify-end gap-3">
                    <a
                      href={`/api/auctions/${auctionId}/points/uploads/${u.id}/export.csv`}
                      className="text-xs underline underline-offset-2"
                      title="Download this snapshot as CSV — re-uploadable as-is"
                    >
                      Download
                    </a>
                    <DeletePointsUploadButton
                      auctionId={auctionId}
                      uploadId={u.id}
                      when={formatDateTime(u.uploadedAt)}
                      isLatest={i === 0}
                      isOnly={uploads.length === 1}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
