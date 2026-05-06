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

export async function logTocAudit(input: TocAuditInput) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase server key is not configured." };

  try {
    await supabase.from("audit_log").insert({
      actor_id: input.actor?.id === "development-admin" ? null : input.actor?.id,
      actor_role: input.actor?.role,
      action: input.action,
      entity_type: input.entityTable || input.action,
      entity_table: input.entityTable,
      entity_id: input.entityId,
      scope: input.scope,
      details: input.details || {}
    }).throwOnError();
    return { ok: true, error: undefined };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Audit log write failed."
    };
  }
}
