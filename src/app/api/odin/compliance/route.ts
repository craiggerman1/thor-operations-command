import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { odinDueToIso, odinIdsFromPayload, odinOperation, odinRegionId } from "@/lib/odin-api-utils";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { buildOdinOperationalContext, saveOdinOperationalMemory } from "@/lib/odin-operational-context";
import { getSupabaseAdminClient } from "@/lib/supabase";

function normaliseStatus(value: unknown) {
  const status = String(value || "open").trim().toLowerCase();
  if (["not_started", "in_progress", "complete", "blocked", "open"].includes(status)) return status;
  if (["closed", "done", "completed"].includes(status)) return "complete";
  return "open";
}

function normalisePriority(value: unknown) {
  const priority = String(value || "normal").trim().toLowerCase();
  if (["urgent", "high", "normal", "low"].includes(priority)) return priority;
  return "normal";
}

function normaliseDirective(value: unknown) {
  if (value === "National Ops Directive" || value === "Scheduled Directive" || value === "To Do") return value;
  return "Scheduled Directive";
}

function complianceUpdates(payload: Record<string, unknown>) {
  const source = (payload.updates && typeof payload.updates === "object" ? payload.updates : payload) as Record<string, unknown>;
  const updates: Record<string, string | null> = { updated_at: new Date().toISOString() };
  const actionUpdates: Record<string, string | null> = { updated_at: new Date().toISOString() };

  if (typeof source.title === "string") {
    updates.title = source.title.trim();
    actionUpdates.title = source.title.trim();
  }
  if (typeof source.detail === "string") {
    updates.detail = source.detail;
    actionUpdates.detail = source.detail;
  }
  if (typeof source.status === "string") {
    const status = normaliseStatus(source.status);
    updates.status = status;
    actionUpdates.status = status === "complete" ? "closed" : "open";
    actionUpdates.closed_at = status === "complete" ? new Date().toISOString() : null;
  }
  const dueAt = odinDueToIso(source.dueDate || source.dueAt);
  if (dueAt !== undefined) {
    updates.due_at = dueAt;
    actionUpdates.due_at = dueAt;
  }
  if (typeof source.directiveType === "string") actionUpdates.directive_type = normaliseDirective(source.directiveType);
  if (typeof source.priority === "string") actionUpdates.priority = normalisePriority(source.priority);

  return { updates, actionUpdates, source };
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));

  try {
    const action = odinOperation(payload.action, ["create", "update", "complete", "close", "clear", "done", "delete"]);
    const actor = permission.kind === "toc" ? permission.user : undefined;

    if (action === "create") {
      const title = String(payload.title || "").trim();
      if (!title) throw new Error("Compliance title is required.");

      const detail = String(payload.detail || payload.recommendedAction || "Compliance action requires manager close-out.");
      const regionId = await odinRegionId(payload.region || payload.ownerScope || "National");
      const dueAt = odinDueToIso(payload.dueDate || payload.dueAt) || null;

      const { data: registerItem, error: registerError } = await supabase
        .from("compliance_items")
        .insert({
          title,
          detail,
          region_id: regionId,
          status: normaliseStatus(payload.status),
          due_at: dueAt
        })
        .select("id")
        .single();

      if (registerError) throw registerError;

      const regionName = String(payload.region || payload.ownerScope || "National");
      const operationalContext = buildOdinOperationalContext({
        payload,
        destination: "compliance",
        region: regionName,
        title,
        sourcePage: "Compliance",
        severity: payload.severity === "blue" ? "blue" : "red",
        priority: normalisePriority(payload.priority),
        dueAt
      });

      const { data: actionItem, error: actionError } = await supabase
        .from("action_items")
        .insert({
          title,
          detail,
          source_page: "compliance",
          directive_type: normaliseDirective(payload.directiveType),
          priority: normalisePriority(payload.priority),
          status: "open",
          assigned_region_id: regionId,
          due_at: dueAt
        })
        .select("id")
        .single();

      if (actionError) throw actionError;

      await supabase
        .from("compliance_items")
        .update({ linked_action_id: actionItem.id, updated_at: new Date().toISOString() })
        .eq("id", registerItem.id)
        .throwOnError();

      await logTocAudit({
        actor,
        action: "odin.compliance.create",
        entityTable: "compliance_items",
        entityId: registerItem.id,
        details: { actionItemId: actionItem.id, title, ownership: operationalContext, actorType: permission.kind }
      });
      await saveOdinOperationalMemory({
        context: operationalContext,
        sourceType: "compliance_item",
        sourceId: registerItem.id,
        region: regionName,
        title,
        summary: detail,
        lastResponse: { linkedActionId: actionItem.id, createdBy: "odin" }
      });

      return NextResponse.json({ connected: true, action: "create", createdComplianceIds: [registerItem.id], createdActionIds: [actionItem.id], count: 1 });
    }

    const ids = odinIdsFromPayload(payload, ["complianceIds", "createdComplianceIds"]);
    if (!ids.length) throw new Error("Compliance id or ids are required for non-create operations.");

    const { data: items, error: readError } = await supabase
      .from("compliance_items")
      .select("id,linked_action_id")
      .in("id", ids);

    if (readError) throw readError;
    const linkedActionIds = ((items as Array<{ linked_action_id: string | null }> | null) || []).map((item) => item.linked_action_id).filter(Boolean) as string[];

    if (action === "delete") {
      const { data, error } = await supabase.from("compliance_items").delete().in("id", ids).select("id");
      if (error) throw error;
      if (linkedActionIds.length) await supabase.from("action_items").delete().in("id", linkedActionIds).throwOnError();
      const deletedIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
      await logTocAudit({ actor, action: "odin.compliance.delete", entityTable: "compliance_items", entityId: deletedIds[0], details: { requestedIds: ids, deletedIds, linkedActionIds, actorType: permission.kind } });
      return NextResponse.json({ connected: true, action: "delete", deletedComplianceIds: deletedIds, deletedActionIds: linkedActionIds, count: deletedIds.length });
    }

    const { updates, actionUpdates } = action === "update" ? complianceUpdates(payload) : {
      updates: { status: "complete", updated_at: new Date().toISOString() },
      actionUpdates: { status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    };

    if (action === "update" && Object.keys(updates).length <= 1) throw new Error("No supported compliance updates were supplied.");

    const { data, error } = await supabase.from("compliance_items").update(updates).in("id", ids).select("id");
    if (error) throw error;
    if (linkedActionIds.length) await supabase.from("action_items").update(actionUpdates).in("id", linkedActionIds).throwOnError();
    const affectedIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
    const auditAction = action === "update" ? "odin.compliance.update" : "odin.compliance.complete";
    await logTocAudit({ actor, action: auditAction, entityTable: "compliance_items", entityId: affectedIds[0], details: { requestedIds: ids, affectedIds, linkedActionIds, updates, actorType: permission.kind } });
    return NextResponse.json({ connected: true, action, updatedComplianceIds: action === "update" ? affectedIds : undefined, completedComplianceIds: action !== "update" ? affectedIds : undefined, linkedActionIds, count: affectedIds.length });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Odin compliance request could not be completed." }, { status: 400 });
  }
}
