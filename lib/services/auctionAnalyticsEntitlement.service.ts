import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

export async function setAnalyticsEnabled(teamAuctionEntryId: string, enabled: boolean) {
  const entry = await prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } });
  if (!entry) throw new ValidationError("Team auction entry not found");

  return prisma.teamAuctionEntry.update({
    where: { id: teamAuctionEntryId },
    data: { analyticsEnabled: enabled },
  });
}
