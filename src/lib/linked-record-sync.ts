import { getSupabaseAdminClient } from "@/lib/supabase";

export async function markComplianceForClosedActions(actionIds: string[]) {
  const ids = actionIds.filter(Boolean);
  if (!ids.length) return;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase
    .from("compliance_items")
    .update({ status: "complete", updated_at: new Date().toISOString() })
    .in("linked_action_id", ids)
    .throwOnError();
}

export async function reopenComplianceForReturnedActions(actionIds: string[]) {
  const ids = actionIds.filter(Boolean);
  if (!ids.length) return;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase
    .from("compliance_items")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .in("linked_action_id", ids)
    .throwOnError();
}

export async function clearComplianceForDeletedActions(actionIds: string[]) {
  const ids = actionIds.filter(Boolean);
  if (!ids.length) return;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase
    .from("compliance_items")
    .update({ status: "complete", linked_action_id: null, updated_at: new Date().toISOString() })
    .in("linked_action_id", ids)
    .throwOnError();
}
