import { logTocAudit } from "@/lib/audit";
import { normaliseOdinTargetRegions } from "@/lib/odin-actions";
import { buildOdinOperationalContext, saveOdinOperationalMemory } from "@/lib/odin-operational-context";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { TocAuthenticatedUser } from "@/lib/toc-auth";

type OdinTodoInput = {
  payload: Record<string, unknown>;
  actorKind: "odin" | "toc";
  actor?: TocAuthenticatedUser;
};

type RegionRow = {
  name: string;
  is_active?: boolean;
};

type TodoOperation = "create" | "update" | "delete" | "complete" | "close" | "clear" | "done";

function normaliseTodoOperation(value: unknown): TodoOperation {
  const operation = String(value || "create").trim().toLowerCase();
  if (["create", "update", "delete", "complete", "close", "clear", "done"].includes(operation)) return operation as TodoOperation;
  throw new Error(`Unsupported Odin To Do operation: ${operation || "empty"}.`);
}

function todoIdsFromPayload(payload: Record<string, unknown>) {
  const rawIds = payload.ids || payload.todoIds || payload.createdTodoIds || payload.id;
  const ids = (Array.isArray(rawIds) ? rawIds : [rawIds])
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function shareTargetForRegion(region: string) {
  if (region === "National") return "National Ops";
  if (region === "Workshop") return "Workshop";
  return `${region} Manager`;
}

async function getTodoTargetRegions(targetRegions: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const wantsAllManagers = targetRegions.some((region) => ["all", "all managers", "all regions"].includes(region.toLowerCase()));
  const { data, error } = await supabase
    .from("regions")
    .select("name,is_active")
    .order("name", { ascending: true });

  if (error) throw error;

  const activeRegions = ((data as RegionRow[] | null) || []).filter((region) => region.is_active !== false);
  if (wantsAllManagers) return activeRegions.filter((region) => region.name !== "National").map((region) => region.name);

  return Array.from(new Set(targetRegions.map((targetName) => {
    if (targetName.toLowerCase() === "head office") return "National";
    if (targetName === "National") return "National";
    return activeRegions.find((region) => region.name.toLowerCase() === targetName.toLowerCase())?.name || null;
  }).filter(Boolean) as string[]));
}

function dueToIso(value: unknown) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = raw.includes("T") ? new Date(raw) : new Date(`${raw}T17:00:00+10:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function createTitle(payload: Record<string, unknown>) {
  const title = String(payload.title || payload.text || payload.reminder || "").trim();
  if (!title) throw new Error("To Do reminder title is required.");

  const dueAt = dueToIso(payload.dueDate || payload.dueAt);
  const detailSuffix = dueAt ? ` Due ${new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(dueAt))}.` : "";
  return `${title}${detailSuffix}`;
}

function todoUpdates(payload: Record<string, unknown>) {
  const source = (payload.updates && typeof payload.updates === "object" ? payload.updates : payload) as Record<string, unknown>;
  const updates: Record<string, string | boolean | null> = { updated_at: new Date().toISOString() };

  const title = source.title || source.text || source.reminder;
  if (typeof title === "string") updates.title = title.trim();
  if (typeof source.done === "boolean") updates.is_done = source.done;
  if (typeof source.isDone === "boolean") updates.is_done = source.isDone;
  if (typeof source.important === "boolean") updates.is_important = source.important;
  if (typeof source.isImportant === "boolean") updates.is_important = source.isImportant;
  if ("sharedWith" in source) updates.shared_with = source.sharedWith ? String(source.sharedWith) : null;
  if (typeof source.ownerRole === "string") updates.owner_role = source.ownerRole;
  if (typeof source.ownerScope === "string") updates.owner_scope = source.ownerScope;
  if (typeof source.status === "string" && ["complete", "completed", "done", "closed"].includes(source.status)) updates.is_done = true;

  return updates;
}

export async function handleOdinTodoItems(input: OdinTodoInput) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const operation = normaliseTodoOperation(input.payload.action);

  if (operation === "create") {
    const title = createTitle(input.payload);
    const targetRegions = await getTodoTargetRegions(normaliseOdinTargetRegions(input.payload.targetRegions || input.payload.regions || input.payload.region));
    if (!targetRegions.length) throw new Error("No valid To Do target regions supplied.");

    const rows = targetRegions.map((region) => ({
      title,
      is_done: false,
      is_important: input.payload.important !== false,
      shared_with: shareTargetForRegion(region),
      owner_role: "manager",
      owner_scope: region
    }));

    const { data, error } = await supabase
      .from("todo_items")
      .insert(rows)
      .select("id");

    if (error) throw error;

    const createdTodoIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
    const ownership = targetRegions.map((region, index) => ({
      todoId: createdTodoIds[index],
      region,
      ...buildOdinOperationalContext({
        payload: input.payload,
        destination: "todos",
        region,
        title,
        sourcePage: "To Do",
        severity: input.payload.important === false ? "blue" : "amber",
        priority: input.payload.important === false ? "normal" : "high",
        dueAt: dueToIso(input.payload.dueDate || input.payload.dueAt)
      })
    }));
    await logTocAudit({
      actor: input.actor,
      action: "odin.todo.direct_create",
      entityTable: "todo_items",
      entityId: createdTodoIds[0],
      scope: targetRegions.join(", "),
      details: { title, targetRegions, createdTodoIds, ownership, actorType: input.actorKind }
    });

    await Promise.all(ownership.map((context) => context.todoId
      ? saveOdinOperationalMemory({
        context,
        sourceType: "todo_item",
        sourceId: context.todoId,
        region: context.region,
        title,
        summary: "Odin-created shared To Do reminder.",
        lastResponse: { createdBy: "odin" }
      })
      : Promise.resolve()
    ));

    return { action: "create", createdTodoIds, count: createdTodoIds.length, targetRegions };
  }

  const ids = todoIdsFromPayload(input.payload);
  if (!ids.length) throw new Error("To Do id or ids are required for Odin update/delete/complete operations.");

  if (operation === "delete") {
    const { data, error } = await supabase
      .from("todo_items")
      .delete()
      .in("id", ids)
      .select("id,title");

    if (error) throw error;

    const deletedTodoIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
    await logTocAudit({
      actor: input.actor,
      action: "odin.todo.delete",
      entityTable: "todo_items",
      entityId: deletedTodoIds[0],
      details: { requestedIds: ids, deletedTodoIds, actorType: input.actorKind }
    });

    return { action: "delete", deletedTodoIds, count: deletedTodoIds.length };
  }

  const updates = operation === "update" ? todoUpdates(input.payload) : {
    is_done: true,
    updated_at: new Date().toISOString()
  };

  if (operation === "update" && Object.keys(updates).length <= 1) throw new Error("No supported To Do updates were supplied.");

  const { data, error } = await supabase
    .from("todo_items")
    .update(updates)
    .in("id", ids)
    .select("id,title,is_done");

  if (error) throw error;

  const affectedTodoIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
  await logTocAudit({
    actor: input.actor,
    action: operation === "update" ? "odin.todo.update" : "odin.todo.complete",
    entityTable: "todo_items",
    entityId: affectedTodoIds[0],
    details: { requestedIds: ids, affectedTodoIds, updates, actorType: input.actorKind }
  });

  if (operation === "update") return { action: "update", updatedTodoIds: affectedTodoIds, count: affectedTodoIds.length };
  return { action: operation, completedTodoIds: affectedTodoIds, count: affectedTodoIds.length };
}
