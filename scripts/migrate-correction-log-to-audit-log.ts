import "dotenv/config";
import { PrismaClient, Prisma, type $Enums } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

/** Thrown to abort (and thus roll back) a dry-run transaction after reading
 * what this script *would* have written. */
class DryRunAbort extends Error {}

/** Maps one AuctionCorrectionLog row's correctionType to the generic
 * AuditLog shape — entityType/entityId/action/before/after. TEAM_BUDGET's
 * targetId is always null (the correction targets the Auction itself, not a
 * sub-entity), confirmed against auctionCorrection.service.ts. */
function mapCorrectionType(log: {
  correctionType: $Enums.AuctionCorrectionType;
  auctionId: string;
  targetId: string | null;
  oldValue: Prisma.Decimal;
  newValue: Prisma.Decimal;
}): { entityType: string; entityId: string; action: string; before: object; after: object } {
  switch (log.correctionType) {
    case "SOLD_PRICE":
      return {
        entityType: "AuctionPlayer",
        entityId: log.targetId!,
        action: "SOLD_PRICE_CORRECTED",
        before: { soldPrice: log.oldValue.toString() },
        after: { soldPrice: log.newValue.toString() },
      };
    case "CATEGORY_BASE_PRICE":
      return {
        entityType: "AuctionCategory",
        entityId: log.targetId!,
        action: "CATEGORY_BASE_PRICE_CORRECTED",
        before: { basePrice: log.oldValue.toString() },
        after: { basePrice: log.newValue.toString() },
      };
    case "TEAM_BUDGET":
      return {
        entityType: "Auction",
        entityId: log.auctionId,
        action: "TEAM_BUDGET_CORRECTED",
        before: { teamBudget: log.oldValue.toString() },
        after: { teamBudget: log.newValue.toString() },
      };
  }
}

/**
 * One-time migration of every existing AuctionCorrectionLog row into the new
 * generic AuditLog table (see prisma/schema.prisma). Idempotent — re-running
 * only ever inserts rows for AuctionCorrectionLog ids not already present in
 * AuditLog.note (used to carry the source id forward for exactly this
 * dedupe check).
 *
 * Defaults to a dry run (logs what would be written, writes nothing). Pass
 * --apply to write. Does NOT drop AuctionCorrectionLog — that's a deliberate
 * follow-up once the new table is confirmed stable.
 */
async function main() {
  const logs = await prisma.auctionCorrectionLog.findMany({ include: { adminUser: true } });
  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${logs.length} AuctionCorrectionLog row(s) found.\n`);

  const alreadyMigrated = new Set(
    (
      await prisma.auditLog.findMany({
        where: { note: { startsWith: "migrated-from-correction-log:" } },
        select: { note: true },
      })
    ).map((r) => r.note!.split(":")[1])
  );

  let migrated = 0;
  let skipped = 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const log of logs) {
          if (alreadyMigrated.has(log.id)) {
            skipped += 1;
            continue;
          }
          const mapped = mapCorrectionType(log);
          console.log(
            `  [auction ${log.auctionId}] ${mapped.action} by ${log.adminUser.loginId}: ${JSON.stringify(mapped.before)} -> ${JSON.stringify(mapped.after)}`
          );
          await tx.auditLog.create({
            data: {
              entityType: mapped.entityType,
              entityId: mapped.entityId,
              auctionId: log.auctionId,
              action: mapped.action,
              actorUserId: log.adminUserId,
              actorLabel: log.adminUser.loginId,
              before: mapped.before,
              after: mapped.after,
              note: `migrated-from-correction-log:${log.id}`,
              createdAt: log.createdAt,
            },
          });
          migrated += 1;
        }
        if (!APPLY) throw new DryRunAbort();
      },
      { timeout: 120_000 }
    );
  } catch (e) {
    if (!(e instanceof DryRunAbort)) throw e;
  }

  console.log(
    `\n${APPLY ? "Migrated" : "Would migrate"}: ${migrated} row(s), ${skipped} already migrated.`
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
