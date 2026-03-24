import { getDb, isDatabaseConfigured } from "@/db";
import { auditLogs } from "@/db/schema";
import { isAuthDevBypassEnabled } from "@/lib/dev-bypass";

export async function writeAudit(params: {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured()) return;
  await getDb().insert(auditLogs).values({
    userId: isAuthDevBypassEnabled() ? undefined : (params.userId ?? undefined),
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    payload: params.payload,
  });
}
