import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { isAuthDevBypassEnabled } from "@/lib/dev-bypass";

export async function writeAudit(params: {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    userId: isAuthDevBypassEnabled() ? undefined : (params.userId ?? undefined),
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    payload: params.payload,
  });
}
