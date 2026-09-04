import { expect } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AuditAction, AuditEntityType } from "@/lib/services/auditLog.service";

/** Asserts exactly one AuditLog row exists matching the given filter, and
 * returns it for further inspection (before/after/note/actorLabel). Used as
 * an added assertion alongside a mutation's own existing assertions, not as
 * a replacement for them. */
export async function expectAuditLog(filter: {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actorUserId?: string;
}) {
  const rows = await prisma.auditLog.findMany({ where: filter });
  expect(rows, `expected exactly one AuditLog row for ${JSON.stringify(filter)}, found ${rows.length}`).toHaveLength(
    1
  );
  return rows[0];
}

/** Asserts no AuditLog row exists for the given entity/action — used to
 * prove a deliberately-excluded mutation (e.g. placeBid) never writes one. */
export async function expectNoAuditLog(filter: { entityType: AuditEntityType; action: AuditAction }) {
  const count = await prisma.auditLog.count({ where: filter });
  expect(count, `expected zero AuditLog rows for ${JSON.stringify(filter)}, found ${count}`).toBe(0);
}
