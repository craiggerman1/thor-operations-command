import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { isOdinExternal, requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { canAccessScope, hasNationalAccess } from "@/lib/toc-auth";
import { createOdinDirectActionItems } from "@/lib/odin-actions";
import { normaliseOdinItemType, normaliseOdinSeverity, normaliseOdinStatus } from "@/lib/odin";
import type { OdinItemStatus } from "@/lib/odin";

type OdinItemRow = {
  id: string;
  item_type: string;
  title: string;
  summary: string | null;
  region: string;
  source_type: string;
  source_id: string | null;
  severity: string;
  confidence: number;
  approval_required: boolean;
  status: OdinItemStatus;
  noticed: string | null;
  why_it_matters: string | null;
  recommended_action: string | null;
  assigned_to: string | null;
  due_at: string | null;
  created_by: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RegionRow = {
  id: string;
  name: string;
  is_active?: boolean;
};

const humanOnlyActions = new Set(["approve", "reject", "dismiss", "done", "update"]);

function mapOdinItem(row: OdinItemRow) {
  const actionRequest = row.item_type === "action_request" ? normaliseActionRequestPayload(row.payload || {}, row.region) : undefined;
  return {
    id: row.id,
    itemType: normaliseOdinItemType(row.item_type),
    title: row.title,
    summary: row.summary || "",
    region: row.region || "National",
    sourceType: row.source_type || "toc",
    sourceId: row.source_id,
    severity: normaliseOdinSeverity(row.severity),
    confidence: Number(row.confidence) || 0,
    approvalRequired: row.approval_required,
    status: normaliseOdinStatus(row.status),
    noticed: row.noticed || "",
    whyItMatters: row.why_it_matters || "",
    recommendedAction: row.recommended_action || "",
    assignedTo: row.assigned_to || "National",
    dueAt: row.due_at,
    actionRequest,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normaliseActionRequestPayload(payload: Record<string, unknown>, fallbackRegion: string) {
  return {
    targetRegions: normaliseTargetRegions(payload.targetRegions, fallbackRegion),
    directiveType: normaliseDirective(payload.directiveType),
    priority: normalisePriority(payload.priority),
    sourcePage: normaliseSourcePage(payload.sourcePage),
    createdActionIds: Array.isArray(payload.createdActionIds) ? payload.createdActionIds.map(String) : undefined
  };
}

function normaliseTargetRegions(value: unknown, fallbackRegion: string) {
  if (Array.isArray(value)) {
    const regions = value.map((region) => String(region).trim()).filter(Boolean);
    return regions.length ? regions : [fallbackRegion || "National"];
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((region) => region.trim()).filter(Boolean);
  }

  return [fallbackRegion || "National"];
}

function normaliseDirective(value: unknown): "National Ops Directive" | "Scheduled Directive" | "To Do" {
  if (value === "National Ops Directive" || value === "Scheduled Directive" || value === "To Do") return value;
  return "National Ops Directive";
}

function normalisePriority(value: unknown): "urgent" | "high" | "normal" | "low" {
  if (value === "urgent" || value === "high" || value === "normal" || value === "low") return value;
  return "high";
}

function normaliseSourcePage(value: unknown) {
  const source = String(value || "Action Centre").trim();
  const map: Record<string, string> = {
    "Action Centre": "action-centre",
    Compliance: "compliance",
    Productivity: "productivity",
    "Equipment Servicing": "equipment-servicing",
    "Stock Orders": "stock-orders",
    Jobsheets: "jobsheets",
    Calendar: "calendar",
    "Staff Availability": "staff-availability",
    "To Do": "to-do"
  };

  return map[source] || source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "action-centre";
}

async function getTargetRegions(targetRegions: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const wantsAllManagers = targetRegions.some((region) => ["all", "all managers", "all regions"].includes(region.toLowerCase()));
  const { data, error } = await supabase
    .from("regions")
    .select("id,name,is_active")
    .order("name", { ascending: true });

  if (error) throw error;

  const regions = ((data as RegionRow[] | null) || []).filter((region) => region.is_active !== false);
  if (wantsAllManagers) return regions.filter((region) => region.name !== "National");

  return targetRegions.map((targetName) => {
    if (targetName === "National") return { id: null, name: "National" };
    return regions.find((region) => region.name.toLowerCase() === targetName.toLowerCase()) || null;
  }).filter(Boolean) as Array<{ id: string | null; name: string }>;
}

function actionDueDate(item: OdinItemRow, payload: Record<string, unknown>) {
  const rawDueDate = payload.dueDate || payload.dueAt || item.due_at;
  if (!rawDueDate) return null;
  const date = String(rawDueDate);
  const parsed = date.includes("T") ? new Date(date) : new Date(`${date}T17:00:00+10:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function createActionItemsFromOdinRequest(itemId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const { data, error } = await supabase
    .from("odin_items")
    .select("id,item_type,title,summary,region,severity,status,noticed,why_it_matters,recommended_action,assigned_to,due_at,payload")
    .eq("id", itemId)
    .single();

  if (error) throw error;
  const item = data as OdinItemRow;
  if (item.item_type !== "action_request") return { createdActionIds: [], itemPayload: item.payload || {} };
  if (item.status !== "pending") throw new Error("Only pending Odin action requests can create Action Centre items.");

  const payload = item.payload || {};
  const actionRequest = normaliseActionRequestPayload(payload, item.region);
  const targetRegions = await getTargetRegions(actionRequest.targetRegions);
  if (!targetRegions.length) throw new Error("No valid target regions supplied for Odin action request.");

  const detail = String(payload.actionDetail || item.recommended_action || item.summary || "Odin proposed this action item for manager close-out.");
  const dueAt = actionDueDate(item, payload);
  const actionRows = targetRegions.map((region) => ({
    title: item.title,
    detail,
    source_page: actionRequest.sourcePage,
    directive_type: actionRequest.directiveType,
    priority: actionRequest.priority,
    status: "open",
    assigned_region_id: region.id,
    due_at: dueAt
  }));

  const { data: createdActions, error: insertError } = await supabase
    .from("action_items")
    .insert(actionRows)
    .select("id");

  if (insertError) throw insertError;
  return {
    createdActionIds: ((createdActions as Array<{ id: string }> | null) || []).map((row) => row.id),
    itemPayload: payload
  };
}

function permittedRegions(permission: Awaited<ReturnType<typeof requireOdinOrTocNationalUser>>) {
  if (permission.kind === "odin") return ["National"];
  if (!permission.user) return [];
  return hasNationalAccess(permission.user) ? ["National"] : permission.user.regions;
}

function canSeeRegion(permission: Awaited<ReturnType<typeof requireOdinOrTocNationalUser>>, region: string) {
  if (permission.kind === "odin") return true;
  return Boolean(permission.user && canAccessScope(permission.user, region));
}

async function logOdinActivity(input: {
  itemId?: string | null;
  actorId?: string | null;
  actorType: string;
  action: string;
  note?: string;
  payload?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("odin_activity_log").insert({
    odin_item_id: input.itemId || null,
    actor_profile_id: input.actorId || null,
    actor_type: input.actorType,
    action: input.action,
    note: input.note || "",
    payload: input.payload || {}
  });
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, items: [], error: "Supabase server key is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const region = url.searchParams.get("region");
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  let query = supabase
    .from("odin_items")
    .select("id,item_type,title,summary,region,source_type,source_id,severity,confidence,approval_required,status,noticed,why_it_matters,recommended_action,assigned_to,due_at,created_by,payload,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(80);

  if (status && status !== "all") query = query.eq("status", status);
  if (type && type !== "all") query = query.eq("item_type", type);
  if (region && region !== "National") query = query.eq("region", region);
  if (permission.kind === "toc" && permission.user && !hasNationalAccess(permission.user)) {
    query = query.in("region", permission.user.regions);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ connected: false, items: [], error: error.message }, { status: 500 });

  return NextResponse.json({
    connected: true,
    permittedRegions: permittedRegions(permission),
    items: ((data as OdinItemRow[] | null) || []).map(mapOdinItem)
  });
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json();
  const action = String(payload.action || "create");
  if (isOdinExternal(permission) && humanOnlyActions.has(action)) {
    return NextResponse.json({ error: "Odin can create operational items directly, but cannot approve, reject, dismiss, close, delete, or edit account controls." }, { status: 403 });
  }

  if (action === "create") {
    const title = String(payload.title || "").trim();
    if (!title) return NextResponse.json({ error: "Odin item title is required." }, { status: 400 });

    const region = String(payload.region || "National");
    if (!canSeeRegion(permission, region)) return NextResponse.json({ error: "You do not have permission to create Odin items for this region." }, { status: 403 });

    const itemType = normaliseOdinItemType(payload.itemType);
    const shouldDirectCreateAction = permission.kind === "odin"
      && ["action_request", "alert", "recommendation", "follow_up"].includes(itemType)
      && ["red", "amber"].includes(normaliseOdinSeverity(payload.severity));

    if (shouldDirectCreateAction) {
      try {
        const directResult = await createOdinDirectActionItems({
          payload: {
            ...payload,
            targetRegions: payload.targetRegions || payload.regions || payload.region || region,
            detail: payload.detail || payload.actionDetail || payload.recommendedAction || payload.summary,
            directiveType: payload.directiveType || "National Ops Directive",
            priority: payload.priority || (normaliseOdinSeverity(payload.severity) === "red" ? "urgent" : "high")
          },
          actorKind: "odin"
        });
        return NextResponse.json({ connected: true, directActionCreated: true, ...directResult });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Odin action could not be created." }, { status: 400 });
      }
    }

    const item = {
      item_type: itemType,
      title,
      summary: String(payload.summary || ""),
      region,
      source_type: String(payload.sourceType || "toc"),
      source_id: payload.sourceId ? String(payload.sourceId) : null,
      severity: normaliseOdinSeverity(payload.severity),
      confidence: Math.max(0, Math.min(Number(payload.confidence) || 75, 100)),
      approval_required: permission.kind === "odin" ? true : payload.approvalRequired !== false,
      status: "pending",
      noticed: String(payload.noticed || ""),
      why_it_matters: String(payload.whyItMatters || ""),
      recommended_action: String(payload.recommendedAction || ""),
      assigned_to: String(payload.assignedTo || region),
      due_at: payload.dueAt ? new Date(payload.dueAt).toISOString() : null,
      created_by: permission.kind === "odin" ? "odin" : permission.user?.id || "toc_user",
      payload: {
        ...(typeof payload.extra === "object" && payload.extra ? payload.extra : {}),
        ...(payload.targetRegions ? { targetRegions: payload.targetRegions } : {}),
        ...(payload.directiveType ? { directiveType: payload.directiveType } : {}),
        ...(payload.priority ? { priority: payload.priority } : {}),
        ...(payload.sourcePage ? { sourcePage: payload.sourcePage } : {}),
        ...(payload.actionDetail ? { actionDetail: payload.actionDetail } : {}),
        ...(payload.dueDate ? { dueDate: payload.dueDate } : {})
      }
    };

    const { data, error } = await supabase.from("odin_items").insert(item).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logOdinActivity({
      itemId: data.id,
      actorId: permission.kind === "toc" ? permission.user?.id : null,
      actorType: permission.kind,
      action: "odin.item.create",
      note: title,
      payload: { itemType: item.item_type, region }
    });
    await logTocAudit({
      actor: permission.kind === "toc" ? permission.user : undefined,
      action: "odin.item.create",
      entityTable: "odin_items",
      entityId: data.id,
      scope: region,
      details: { itemType: item.item_type, title, actorType: permission.kind }
    });

    return GET(new Request(request.url, { headers: request.headers }));
  }

  if (["approve", "reject", "dismiss", "done", "update"].includes(action)) {
    const id = String(payload.id || "");
    if (!id) return NextResponse.json({ error: "Odin item id is required." }, { status: 400 });

    const updates: Record<string, string | number | boolean | null | Record<string, unknown>> = { updated_at: new Date().toISOString() };
    if (action === "approve") {
      const { createdActionIds, itemPayload } = await createActionItemsFromOdinRequest(id);
      updates.status = "approved";
      updates.approved_by = permission.kind === "toc" ? permission.user?.id || null : null;
      updates.approved_at = new Date().toISOString();
      if (createdActionIds.length) updates.payload = { ...itemPayload, createdActionIds };
    }
    if (action === "reject") updates.status = "rejected";
    if (action === "dismiss") updates.status = "dismissed";
    if (action === "done") updates.status = "done";
    if (action === "update") {
      if (typeof payload.status === "string") updates.status = normaliseOdinStatus(payload.status);
      if (typeof payload.summary === "string") updates.summary = payload.summary;
      if (typeof payload.recommendedAction === "string") updates.recommended_action = payload.recommendedAction;
    }

    const { error } = await supabase.from("odin_items").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logOdinActivity({
      itemId: id,
      actorId: permission.kind === "toc" ? permission.user?.id : null,
      actorType: permission.kind,
      action: `odin.item.${action}`,
      note: String(payload.note || "")
    });
    await logTocAudit({
      actor: permission.kind === "toc" ? permission.user : undefined,
      action: `odin.item.${action}`,
      entityTable: "odin_items",
      entityId: id,
      details: { actorType: permission.kind }
    });

    return GET(new Request(request.url, { headers: request.headers }));
  }

  return NextResponse.json({ error: "Unsupported Odin item action." }, { status: 400 });
}
