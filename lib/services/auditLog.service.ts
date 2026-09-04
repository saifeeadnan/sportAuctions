import { Prisma } from "@/app/generated/prisma/client";

/** Every model an audit row can describe. Kept as a closed union (not a
 * free-form string) so a typo can't silently create an unqueryable
 * entityType — every writer imports this instead of inlining a literal. */
export type AuditEntityType =
  | "Auction"
  | "AuctionCategory"
  | "AuctionPlayer"
  | "TeamAuctionEntry"
  | "PreAuctionSubmission"
  | "Team"
  | "User"
  | "LeagueMembership";

/** Every audited business action, as a semantic label — never a raw CRUD
 * verb. One entry per mutation actually hooked up; see the audit-log plan
 * for which functions write which action. */
export type AuditAction =
  | "AUCTION_CREATED"
  | "AUCTION_PLAYER_ADDED"
  | "AUCTION_PLAYER_CATEGORY_CHANGED"
  | "CATEGORY_BID_INCREMENT_CHANGED"
  | "PRE_AUCTION_OPENED"
  | "BIDDING_STARTED_DIRECT"
  | "PRE_AUCTION_LOCKED"
  | "BIDDING_STARTED"
  | "AUCTION_RESET_TO_PRE_BIDDING"
  | "TEAM_SETTINGS_UPDATED"
  | "ON_CLOCK_SETTINGS_UPDATED"
  | "AUCTION_DELETED"
  | "PLAYER_SOLD"
  | "PLAYER_ASSIGNED_BY_ADMIN"
  | "PLAYER_MARKED_UNSOLD"
  | "PLAYER_ALLOCATION_REMOVED"
  | "PLAYER_REMOVED_POST_AUCTION"
  | "PLAYER_ADDED_POST_AUCTION"
  | "PLAYER_REPLACED_POST_AUCTION"
  | "AUCTION_CONCLUDED"
  | "SOLD_PRICE_CORRECTED"
  | "CATEGORY_BASE_PRICE_CORRECTED"
  | "TEAM_BUDGET_CORRECTED"
  | "DRAFT_SUBMITTED"
  | "DRAFT_PICK_REMOVED_BY_ADMIN"
  | "TEAM_CAPTAIN_ASSIGNED"
  | "TEAM_CAPTAIN_CLEARED"
  | "FANTASY_LOCK_DATE_CHANGED"
  | "FANTASY_SETTINGS_UPDATED"
  | "TEAM_CREATED"
  | "TEAM_DELETED"
  | "USER_DELETED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "MEMBERSHIP_DELETED"
  | "MEMBERSHIP_ACTIVATED"
  | "MEMBERSHIP_DEACTIVATED"
  | "USER_REGISTERED"
  | "MEMBERSHIP_ADDED"
  | "PASSWORD_CHANGED_SELF"
  | "PASSWORD_RESET_BY_ADMIN"
  | "PROFILE_UPDATED_SELF"
  | "PROFILE_UPDATED_BY_ADMIN";

/**
 * Writes one audit row. Always takes an explicit transaction client — never
 * defaults to the top-level `prisma` — so the audit row commits or fails
 * atomically with the real change it describes, same convention
 * `repriceFantasyTeamPlayers` already established.
 *
 * Looks up the actor's current loginId to snapshot into `actorLabel` at
 * write time: an extra query, but these are all admin/business-decision
 * actions, never the high-frequency live-bidding path (placeBid is
 * deliberately not audited at all — see auctionCorrection cascade
 * reasoning in the plan). `before`/`after` must only ever contain the
 * fields this action actually changed, never a whole-row dump, and must
 * NEVER contain a password hash or other secret in either direction.
 */
export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  entry: {
    entityType: AuditEntityType;
    entityId: string;
    auctionId?: string | null;
    action: AuditAction;
    actorUserId: string;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
    note?: string | null;
  }
): Promise<void> {
  const actor = await tx.user.findUnique({
    where: { id: entry.actorUserId },
    select: { loginId: true },
  });
  await tx.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      auctionId: entry.auctionId ?? null,
      action: entry.action,
      actorUserId: entry.actorUserId,
      actorLabel: actor?.loginId ?? null,
      before: entry.before ?? Prisma.JsonNull,
      after: entry.after ?? Prisma.JsonNull,
      note: entry.note ?? null,
    },
  });
}
