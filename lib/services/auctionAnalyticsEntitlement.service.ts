import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";

export async function setAnalyticsEnabled(teamAuctionEntryId: string, enabled: boolean, actorUserId: string) {
  const entry = await prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } });
  if (!entry) throw new ValidationError("Team auction entry not found");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.teamAuctionEntry.update({
      where: { id: teamAuctionEntryId },
      data: { analyticsEnabled: enabled },
    });
    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: teamAuctionEntryId,
      auctionId: entry.auctionId,
      action: enabled ? "ANALYTICS_ENABLED" : "ANALYTICS_DISABLED",
      actorUserId,
      before: { analyticsEnabled: entry.analyticsEnabled },
      after: { analyticsEnabled: enabled },
    });
    return updated;
  });
}
