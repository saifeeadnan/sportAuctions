import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { lockPreAuctionAction } from "@/lib/actions/auction.actions";
import { ActionResultForm } from "@/components/ui/ActionResultForm";
import { card, buttonPrimary, buttonSecondary } from "@/lib/ui";

export default async function LockReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { leagueIds } = await requireAdminOrLeagueAdmin();

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      tournament: true,
      entries: { include: { team: true }, orderBy: { team: { name: "asc" } } },
    },
  });
  if (!auction) notFound();
  assertInScope(leagueIds, auction.tournament.leagueId);
  // Viewable at any later stage too (read-only) — only truly unavailable
  // before pre-auction has even opened, since there's nothing to show yet.
  if (auction.status === "CREATED") notFound();
  const isOpen = auction.status === "PRE_AUCTION_OPEN";

  const submissions = await prisma.preAuctionSubmission.findMany({
    where: { teamAuctionEntry: { auctionId: id } },
    include: {
      teamAuctionEntry: { include: { team: true } },
      auctionPlayer: { include: { player: true } },
    },
    orderBy: [
      { teamAuctionEntry: { team: { name: "asc" } } },
      { auctionPlayer: { player: { name: "asc" } } },
    ],
  });

  const teamsByPlayer = new Map<string, string[]>();
  const playerNameById = new Map<string, string>();
  for (const s of submissions) {
    const list = teamsByPlayer.get(s.auctionPlayerId) ?? [];
    list.push(s.teamAuctionEntry.team.name);
    teamsByPlayer.set(s.auctionPlayerId, list);
    playerNameById.set(s.auctionPlayerId, s.auctionPlayer.player.name);
  }

  const contestedCount = Array.from(teamsByPlayer.values()).filter((t) => t.length > 1).length;

  const submittedEntryIds = new Set(submissions.map((s) => s.teamAuctionEntryId));
  const notSubmitted = auction.entries.filter(
    (e) => e.status !== "PRE_AUCTION_SUBMITTED" && !submittedEntryIds.has(e.id)
  );

  // One column per team, one row per distinct player picked by anyone —
  // pivoted this way (rather than one row per team+player submission) so a
  // contested pick is immediately visible as a single highlighted row with
  // more than one team's column checked, instead of scattered across
  // separate rows per team.
  const teamNames = auction.entries.map((e) => e.team.name);
  const playerRows = Array.from(teamsByPlayer.entries())
    .map(([playerId, teams]) => ({
      playerId,
      playerName: playerNameById.get(playerId) ?? "",
      teams,
    }))
    .sort((a, b) => b.teams.length - a.teams.length || a.playerName.localeCompare(b.playerName));

  const uncontestedCountByTeam = new Map<string, number>();
  for (const row of playerRows) {
    if (row.teams.length > 1) continue;
    const teamName = row.teams[0];
    uncontestedCountByTeam.set(teamName, (uncontestedCountByTeam.get(teamName) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold mb-1">
            {isOpen ? "Review submitted drafts" : "Submitted drafts"}
          </h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {auction.tournament.name} &middot; {auction.name} &middot; {submissions.length} pick(s)
            submitted &middot; {contestedCount} contested player(s)
            {!isOpen && " · pre-auction is locked, this is read-only"}
          </p>
        </div>
        {submissions.length > 0 && (
          <a
            href={`/api/auctions/${auction.id}/lock-review/export.csv`}
            className={buttonSecondary}
          >
            Export CSV
          </a>
        )}
      </div>

      {isOpen && notSubmitted.length > 0 && (
        <p className="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          Not yet submitted: {notSubmitted.map((e) => e.team.name).join(", ")}. Locking normally
          will fail until every team submits — use force lock to proceed anyway.
        </p>
      )}

      {submissions.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No draft picks have been submitted yet.</p>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pl-4 pr-4">Player</th>
                {teamNames.map((teamName) => (
                  <th key={teamName} className="py-2 pr-4 text-center">
                    {teamName} ({uncontestedCountByTeam.get(teamName) ?? 0})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {playerRows.map((row) => {
                const isContested = row.teams.length > 1;
                return (
                  <tr
                    key={row.playerId}
                    className={`border-b border-black/5 dark:border-white/5 last:border-0 ${
                      isContested ? "bg-amber-500/10" : ""
                    }`}
                  >
                    <td className="py-2 pl-4 pr-4">
                      {row.playerName}
                      {isContested && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          {" "}
                          ({row.teams.length})
                        </span>
                      )}
                    </td>
                    {teamNames.map((teamName) => (
                      <td key={teamName} className="py-2 pr-4 text-center">
                        {row.teams.includes(teamName) ? (isContested ? "✓" : teamName) : ""}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isOpen ? (
        <>
          <p className="text-sm text-black/60 dark:text-white/60">
            Contested players will be sent to the live auction pool instead of being
            auto-allocated. Uniquely-picked players will be confirmed to their team immediately at
            category base price.
          </p>

          <div className="flex gap-3">
            <ActionResultForm action={lockPreAuctionAction.bind(null, auction.id, false)}>
              <button type="submit" className={buttonPrimary}>
                Confirm &amp; lock pre-auction
              </button>
            </ActionResultForm>
            <ActionResultForm action={lockPreAuctionAction.bind(null, auction.id, true)}>
              <button type="submit" className={buttonSecondary}>
                Force lock (skip missing submissions)
              </button>
            </ActionResultForm>
            <Link
              href={`/admin/auctions/${auction.id}`}
              className="text-sm underline underline-offset-2 self-center"
            >
              Cancel
            </Link>
          </div>
        </>
      ) : (
        <Link href={`/admin/auctions/${auction.id}`} className={`${buttonSecondary} self-start`}>
          Back to auction
        </Link>
      )}
    </div>
  );
}
