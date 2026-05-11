import { getSupabaseAdminClient } from "@/lib/supabase";
import type { TocAuthenticatedUser } from "@/lib/toc-auth";

type TocAuditInput = {
  actor?: TocAuthenticatedUser;
  action: string;
  entityTable?: string;
  entityId?: string;
  scope?: string;
  details?: Record<string, unknown>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function logTocAudit(input: TocAuditInput) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase server key is not configured." };

  try {
    const actorId = input.actor?.id === "development-admin" ? null : input.actor?.id;
    const entityId = input.entityId && uuidPattern.test(input.entityId) ? input.entityId : undefined;
    const details = {
      ...(input.details || {}),
      ...(input.entityId && !entityId ? { entityId: input.entityId } : {})
    };
    await supabase.from("audit_log").insert({
      actor_id: actorId,
      actor_profile_id: actorId,
      actor_role: input.actor?.role,
      action: input.action,
      entity_type: input.entityTable || input.action,
      entity_table: input.entityTable,
      entity_id: entityId,
      scope: input.scope,
      details
    }).throwOnError();
    return { ok: true, error: undefined };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Audit log write failed."
    };
  }
}
