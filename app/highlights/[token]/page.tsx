import { notFound } from "next/navigation";
import { getAuctionHighlights } from "@/lib/services/auctionHighlights.service";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";
import { formatCalendarDate } from "@/lib/dates";
import { card } from "@/lib/ui";

/**
 * A public recap page, reachable by anyone with the link — no login. This
 * is the only intentionally-unauthenticated page in the app; the token
 * itself (an unguessable random string) is the entire access control, so
 * getAuctionHighlights deliberately never checks a session here.
 */
export default async function HighlightsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const highlights = await getAuctionHighlights(token);
  if (!highlights) notFound();

  const sponsors = await listTournamentSponsors(highlights.tournamentId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">{highlights.auctionName} — highlights</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {highlights.tournamentName} &middot; completed {formatCalendarDate(highlights.completedAt)}
          &middot; {highlights.soldCount} sold, {highlights.unsoldCount} unsold
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {highlights.biggestBuy && (
          <div className={`${card} p-4`}>
            <p className="text-xs text-black/50 dark:text-white/50 mb-1">Biggest buy</p>
            <p className="text-lg font-semibold">{highlights.biggestBuy.playerName}</p>
            <p className="text-sm text-black/60 dark:text-white/60">
              {highlights.biggestBuy.categoryName} &middot; {highlights.biggestBuy.teamName}
            </p>
            <p className="text-2xl font-bold mt-1">{highlights.biggestBuy.price}</p>
          </div>
        )}

        {highlights.bestValuePick && (
          <div className={`${card} p-4`}>
            <p className="text-xs text-black/50 dark:text-white/50 mb-1">Best value pick</p>
            <p className="text-lg font-semibold">{highlights.bestValuePick.playerName}</p>
            <p className="text-sm text-black/60 dark:text-white/60">
              {highlights.bestValuePick.categoryName} &middot; {highlights.bestValuePick.teamName}
            </p>
            <p className="text-2xl font-bold mt-1">{highlights.bestValuePick.price}</p>
          </div>
        )}
      </div>

      {highlights.spendByCategory.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-2">Spend by category</h2>
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pl-4 pr-4">Category</th>
                  <th className="py-2 pr-4">Players sold</th>
                  <th className="py-2 pr-4">Total spent</th>
                </tr>
              </thead>
              <tbody>
                {highlights.spendByCategory.map((c) => (
                  <tr key={c.categoryName} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-2 pl-4 pr-4">{c.categoryName}</td>
                    <td className="py-2 pr-4">{c.playersSold}</td>
                    <td className="py-2 pr-4">{c.totalSpent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
