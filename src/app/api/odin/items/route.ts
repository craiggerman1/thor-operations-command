import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { isOdinExternal, requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { canAccessScope, hasNationalAccess } from "@/lib/toc-auth";
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
  created_at: string;
  updated_at: string;
};

const humanOnlyActions = new Set(["approve", "reject", "dismiss", "done", "update"]);

function mapOdinItem(row: OdinItemRow) {
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
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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
    .select("id,item_type,title,summary,region,source_type,source_id,severity,confidence,approval_required,status,noticed,why_it_matters,recommended_action,assigned_to,due_at,created_by,created_at,updated_at")
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
    return NextResponse.json({ error: "Odin can observe and create pending recommendations only. A TOC user must approve, edit, reject, dismiss or close items." }, { status: 403 });
  }

  if (action === "create") {
    const title = String(payload.title || "").trim();
    if (!title) return NextResponse.json({ error: "Odin item title is required." }, { status: 400 });

    const region = String(payload.region || "National");
    if (!canSeeRegion(permission, region)) return NextResponse.json({ error: "You do not have permission to create Odin items for this region." }, { status: 403 });

    const item = {
      item_type: normaliseOdinItemType(payload.itemType),
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
      payload: typeof payload.extra === "object" && payload.extra ? payload.extra : {}
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

    const updates: Record<string, string | number | boolean | null> = { updated_at: new Date().toISOString() };
    if (action === "approve") {
      updates.status = "approved";
      updates.approved_by = permission.kind === "toc" ? permission.user?.id || null : null;
      updates.approved_at = new Date().toISOString();
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
