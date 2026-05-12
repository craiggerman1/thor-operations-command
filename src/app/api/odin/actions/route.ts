import { NextResponse } from "next/server";
import { blockOdinWriteIfOverwatchPaused } from "@/lib/odin-control";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { createOdinDirectActionItems } from "@/lib/odin-actions";
import { logTocAudit } from "@/lib/audit";
import { handleOdinTodoItems } from "@/lib/odin-todos";
import { clearComplianceForDeletedActions, markComplianceForClosedActions, reopenComplianceForReturnedActions } from "@/lib/linked-record-sync";
import { getSupabaseAdminClient } from "@/lib/supabase";

type OdinActionOperation = "create" | "update" | "delete" | "delete_duplicates" | "close" | "complete" | "clear" | "done";

const allowedStatuses = new Set(["open", "acknowledged", "in_progress", "blocked", "submitted_for_review", "returned_to_manager", "reopened", "escalated", "closed"]);
const allowedPriorities = new Set(["urgent", "high", "normal", "low"]);
const allowedDirectives = new Set(["National Ops Directive", "Scheduled Directive", "To Do"]);

function normaliseOperation(value: unknown): OdinActionOperation {
  const operation = String(value || "create").trim().toLowerCase();
  if (["create", "update", "delete", "delete_duplicates", "close", "complete", "clear", "done"].includes(operation)) {
    return operation as OdinActionOperation;
  }
  throw new Error(`Unsupported Odin action operation: ${operation || "empty"}.`);
}

function actionIdsFromPayload(payload: Record<string, unknown>) {
  const rawIds = payload.ids || payload.actionIds || payload.createdActionIds || payload.id;
  const ids = (Array.isArray(rawIds) ? rawIds : [rawIds])
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function isTodoRequest(payload: Record<string, unknown>) {
  const itemType = String(payload.itemType || payload.type || payload.targetType || payload.kind || "").trim().toLowerCase();
  return ["todo", "to-do", "to_do", "reminder", "todo_item", "to do"].includes(itemType);
}

function normaliseDueAt(value: unknown) {
  if (value === null) return null;
  if (!value) return undefined;

  const date = String(value).trim();
  if (!date) return null;

  const parsed = date.includes("T") ? new Date(date) : new Date(`${date}T17:00:00+10:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function updatePayload(payload: Record<string, unknown>) {
  const source = (payload.updates && typeof payload.updates === "object" ? payload.updates : payload) as Record<string, unknown>;
  const updates: Record<string, string | null> = { updated_at: new Date().toISOString() };

  if (typeof source.title === "string") updates.title = source.title.trim();
  if (typeof source.detail === "string") updates.detail = source.detail;
  if (typeof source.actionDetail === "string") updates.detail = source.actionDetail;
  if (typeof source.recommendedAction === "string") updates.detail = source.recommendedAction;
  if (typeof source.sourcePage === "string") {
    updates.source_page = source.sourcePage.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "action-centre";
  }
  if (typeof source.directiveType === "string" && allowedDirectives.has(source.directiveType)) updates.directive_type = source.directiveType;
  if (typeof source.priority === "string" && allowedPriorities.has(source.priority)) updates.priority = source.priority;
  if (typeof source.status === "string") {
    const status = source.status === "complete" || source.status === "completed" || source.status === "done" ? "closed" : source.status;
    if (allowedStatuses.has(status)) {
      updates.status = status;
      updates.closed_at = status === "closed" ? new Date().toISOString() : null;
    }
  }

  const dueAt = normaliseDueAt(source.dueDate || source.dueAt);
  if (dueAt !== undefined) updates.due_at = dueAt;

  return updates;
}

async function mutateActions(input: {
  operation: Exclude<OdinActionOperation, "create">;
  payload: Record<string, unknown>;
  actorKind: "odin" | "toc";
  actor?: Parameters<typeof logTocAudit>[0]["actor"];
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  if (input.operation === "delete_duplicates") {
    const exactTitle = String(input.payload.exactTitle || input.payload.title || "").trim();
    if (!exactTitle) throw new Error("exactTitle or title is required for duplicate cleanup.");

    const keepPerRegion = Math.max(1, Math.min(Number(input.payload.keepPerRegion) || 1, 10));
    const { data: matchingRows, error: readError } = await supabase
      .from("action_items")
      .select("id,title,status,assigned_region_id,created_at")
      .eq("title", exactTitle)
      .neq("status", "closed")
      .order("created_at", { ascending: true });

    if (readError) throw readError;

    const rows = ((matchingRows as Array<{
      id: string;
      title: string;
      status: string;
      assigned_region_id: string | null;
      created_at: string | null;
    }> | null) || []);

    const keepByRegion = new Map<string, number>();
    const deleteIds = rows.flatMap((row) => {
      const regionKey = row.assigned_region_id || "National";
      const seen = keepByRegion.get(regionKey) || 0;
      keepByRegion.set(regionKey, seen + 1);
      return seen >= keepPerRegion ? [row.id] : [];
    });

    if (!deleteIds.length) {
      return { action: "delete_duplicates", deletedIds: [], count: 0 };
    }

    const { data, error } = await supabase
      .from("action_items")
      .delete()
      .in("id", deleteIds)
      .select("id,title,status");

    if (error) throw error;

    const deletedIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
    await logTocAudit({
      actor: input.actor,
      action: "odin.action.delete_duplicates",
      entityTable: "action_items",
      entityId: deletedIds[0],
      details: { exactTitle, keepPerRegion, matchedCount: rows.length, deletedIds, actorType: input.actorKind }
    });

    return { action: "delete_duplicates", deletedIds, count: deletedIds.length };
  }

  const ids = actionIdsFromPayload(input.payload);
  if (!ids.length) throw new Error("Action id or ids are required for Odin update/delete/close operations.");

  if (input.operation === "delete") {
    const { data, error } = await supabase
      .from("action_items")
      .delete()
      .in("id", ids)
      .select("id,title,status");

    if (error) throw error;

    const affectedIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
    await clearComplianceForDeletedActions(affectedIds);
    await logTocAudit({
      actor: input.actor,
      action: "odin.action.delete",
      entityTable: "action_items",
      entityId: affectedIds[0],
      details: { requestedIds: ids, affectedIds, actorType: input.actorKind }
    });

    return { action: "delete", deletedIds: affectedIds, count: affectedIds.length };
  }

  const updates = input.operation === "update" ? updatePayload(input.payload) : {
    status: "closed",
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (input.operation === "update" && Object.keys(updates).length <= 1) {
    throw new Error("No supported action updates were supplied.");
  }

  const { data, error } = await supabase
    .from("action_items")
    .update(updates)
    .in("id", ids)
    .select("id,title,status");

  if (error) throw error;

  const affectedIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
  if (input.operation === "update") {
    if (updates.status === "closed") await markComplianceForClosedActions(affectedIds);
    if (typeof updates.status === "string" && updates.status !== "closed") await reopenComplianceForReturnedActions(affectedIds);
  } else {
    await markComplianceForClosedActions(affectedIds);
  }
  await logTocAudit({
    actor: input.actor,
    action: input.operation === "update" ? "odin.action.update" : "odin.action.close",
    entityTable: "action_items",
    entityId: affectedIds[0],
    details: { requestedIds: ids, affectedIds, updates, actorType: input.actorKind }
  });

  if (input.operation === "update") return { action: "update", updatedIds: affectedIds, count: affectedIds.length };
  return { action: input.operation, closedIds: affectedIds, count: affectedIds.length };
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;
  const paused = await blockOdinWriteIfOverwatchPaused(permission);
  if (paused) return paused;

  const payload = await request.json().catch(() => ({}));

  try {
    const operation = normaliseOperation(payload.action);
    const actor = permission.kind === "toc" ? permission.user : undefined;
    const result = isTodoRequest(payload)
      ? await handleOdinTodoItems({ payload, actorKind: permission.kind, actor })
      : operation === "create"
      ? await createOdinDirectActionItems({ payload, actorKind: permission.kind, actor })
      : await mutateActions({ operation, payload, actorKind: permission.kind, actor });

    return NextResponse.json({ connected: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Odin action could not be completed." }, { status: 400 });
  }
}
