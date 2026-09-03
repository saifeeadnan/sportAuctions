import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { repriceFantasyTeamPlayers } from "../lib/services/fantasyTeam.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

/** Thrown to abort (and thus roll back) a dry-run transaction after reading
 * what repriceFantasyTeamPlayers *would* have written — lets this script
 * reuse that function verbatim instead of a parallel dry-run implementation. */
class DryRunAbort extends Error {}

/**
 * One-time production data migration: every existing fantasy team's
 * self-picked player was priced under the old rule (real sold price, or
 * category basePrice if unsold) before "self-pick is always priced at the
 * category average" shipped. Every auction defaults to
 * fantasySelfPickRequired: true, so this is wrong for every existing team
 * the instant the feature ships — not just auctions an admin reconfigures.
 *
 * Reuses repriceFantasyTeamPlayers (the exact function the correction
 * cascade and updateFantasySettings use) per auction, so there's only ever
 * one place "how is a fantasy price computed" lives. For an untouched
 * auction (still SOLD_PRICE / fantasySelfPickRequired: true), this is a
 * no-op for every pick except each team's self-pick.
 *
 * Defaults to a dry run (logs deltas, writes nothing). Pass --apply to
 * write. Idempotent either way — safe to re-run.
 */
async function main() {
  const auctions = await prisma.fantasyTeam.findMany({
    select: { auctionId: true },
    distinct: ["auctionId"],
  });

  console.log(
    `${APPLY ? "APPLYING" : "DRY RUN"} — ${auctions.length} auction(s) with at least one fantasy team.\n`
  );

  let totalChanged = 0;
  let totalUnresolvedSelfMatch = 0;

  for (const { auctionId } of auctions) {
    const before = await prisma.fantasyTeamPlayer.findMany({
      where: { fantasyTeam: { auctionId } },
      include: { fantasyTeam: { include: { user: true } }, auctionPlayer: { include: { player: true } } },
    });
    const beforeById = new Map(before.map((p) => [p.id, p]));

    const auction = await prisma.auction.findUniqueOrThrow({
      where: { id: auctionId },
      include: { tournament: true },
    });

    try {
      await prisma.$transaction(async (tx) => {
        // Surface (never silently skip) any team whose owner's self-match
        // can no longer be re-derived (e.g. their loginId changed since they
        // built the team) — that team's self-pick falls back to normal
        // pricing instead of the always-average rule, since the self-match
        // relationship no longer holds.
        if (auction.fantasySelfPickRequired && auction.tournament.rosterId) {
          const teams = await tx.fantasyTeam.findMany({ where: { auctionId }, include: { user: true } });
          for (const team of teams) {
            if (!team.user.loginId) continue;
            const self = await tx.auctionPlayer.findFirst({
              where: {
                auctionId,
                player: {
                  rosterId: auction.tournament.rosterId,
                  loginId: { equals: team.user.loginId, mode: "insensitive" },
                },
              },
            });
            if (!self) {
              totalUnresolvedSelfMatch += 1;
              console.warn(
                `  [auction ${auctionId}] team "${team.name ?? team.id}" (user ${team.user.loginId}) has no re-derivable self-match — its picks reprice under normal rules, no self-pick exemption.`
              );
            }
          }
        }

        await repriceFantasyTeamPlayers(auctionId, tx);

        const after = await tx.fantasyTeamPlayer.findMany({ where: { fantasyTeam: { auctionId } } });
        for (const pick of after) {
          const prev = beforeById.get(pick.id);
          if (prev && !prev.price.equals(pick.price)) {
            totalChanged += 1;
            console.log(
              `  [auction ${auctionId}] ${prev.auctionPlayer.player.name} (team ${prev.fantasyTeam.user.loginId ?? prev.fantasyTeam.userId}): ${prev.price.toString()} -> ${pick.price.toString()}`
            );
          }
        }

        if (!APPLY) throw new DryRunAbort();
      });
    } catch (e) {
      if (!(e instanceof DryRunAbort)) throw e;
    }
  }

  console.log(
    `\n${APPLY ? "Applied" : "Would apply"}: ${totalChanged} price change(s) across ${auctions.length} auction(s).`
  );
  if (totalUnresolvedSelfMatch > 0) {
    console.log(`${totalUnresolvedSelfMatch} team(s) had no re-derivable self-match — see warnings above.`);
  }
  if (!APPLY) {
    console.log("Dry run only — nothing was written. Re-run with --apply to write these changes.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
