import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

/** Thrown to abort (and thus roll back) a dry-run transaction after reading
 * what this script *would* have written. */
class DryRunAbort extends Error {}

/** The pre-feature pricing rule (before configurable fantasy-team settings
 * shipped, see scripts/migrate-fantasy-team-prices.ts): every pick — there
 * was no self-pick or pricing-model concept yet — costs its real sold
 * price, or the category's basePrice if unsold. */
function legacyPrice(pick: {
  auctionPlayer: {
    status: string;
    soldPrice: Prisma.Decimal | null;
    category: { basePrice: Prisma.Decimal };
  };
}): Prisma.Decimal {
  const { auctionPlayer } = pick;
  if (auctionPlayer.status === "SOLD" && auctionPlayer.soldPrice != null) return auctionPlayer.soldPrice;
  return auctionPlayer.category.basePrice;
}

/**
 * Rollback for scripts/migrate-fantasy-team-prices.ts: recomputes every
 * FantasyTeamPlayer.price back to the pre-feature rule, undoing the
 * "self-pick is always priced at the category average" rule's effect on
 * existing data (and, incidentally, any CATEGORY_AVERAGE-mode pricing an
 * admin may have since applied via updateFantasySettings, since the legacy
 * rule has no concept of a pricing model either).
 *
 * Data-only — never touches Auction's fantasyPricingModel/
 * fantasySelfPickRequired/fantasyMaxTeamsPerUser columns, the
 * FantasyPricingModel enum, or FantasyTeam's relaxed unique constraint.
 * Those are schema-level and out of scope for this script.
 *
 * Defaults to a dry run (logs deltas, writes nothing). Pass --apply to
 * write. Idempotent either way — safe to re-run.
 */
async function main() {
  const picks = await prisma.fantasyTeamPlayer.findMany({
    include: {
      fantasyTeam: { include: { user: true } },
      auctionPlayer: { include: { player: true, category: true } },
    },
  });

  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${picks.length} fantasy pick(s) across the database.\n`);

  let totalChanged = 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const pick of picks) {
          const legacy = legacyPrice(pick);
          if (!pick.price.equals(legacy)) {
            totalChanged += 1;
            console.log(
              `  [auction ${pick.auctionPlayer.auctionId}] ${pick.auctionPlayer.player.name} (team ${pick.fantasyTeam.user.loginId ?? pick.fantasyTeam.userId}): ${pick.price.toString()} -> ${legacy.toString()}`
            );
            await tx.fantasyTeamPlayer.update({ where: { id: pick.id }, data: { price: legacy } });
          }
        }
        if (!APPLY) throw new DryRunAbort();
      },
      // Same reasoning as migrate-fantasy-team-prices.ts: production's real
      // network round-trip per query needs more than the 5s default.
      { timeout: 120_000 }
    );
  } catch (e) {
    if (!(e instanceof DryRunAbort)) throw e;
  }

  console.log(
    `\n${APPLY ? "Reverted" : "Would revert"}: ${totalChanged} price change(s) of ${picks.length} total pick(s).`
  );
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
