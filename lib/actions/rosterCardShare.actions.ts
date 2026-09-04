"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessTeamEntry } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { getOrCreateRosterCardToken } from "@/lib/services/rosterCardShare.service";

/** Unlike generateHighlightsLinkAction (admins only), a team's own manager
 * can also mint this link — the same people who can download the PNG roster
 * card today (see assertCanAccessTeamEntry). */
export async function generateRosterCardLinkAction(
  auctionId: string,
  entryId: string
): Promise<ActionResult<{ token: string }>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const entry = await prisma.teamAuctionEntry.findUnique({
      where: { id: entryId },
      include: { team: true, auction: { include: { tournament: true } } },
    });
    if (!entry || entry.auctionId !== auctionId) {
      throw new ValidationError("Team entry not found");
    }
    assertCanAccessTeamEntry(session, entry);
    const token = await getOrCreateRosterCardToken(entryId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath(`/admin/auctions/${auctionId}/teams/${entryId}`);
    revalidatePath(`/admin/auctions/${auctionId}/results`);
    revalidatePath(`/manager/team/${entry.teamId}`);
    return { token };
  });
}
