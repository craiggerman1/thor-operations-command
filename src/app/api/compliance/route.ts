import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { Status } from "@/lib/toc-data";

type ComplianceRow = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  due_at: string | null;
  linked_action_id: string | null;
  region?: { name: string } | { name: string }[] | null;
};

type ActionRow = {
  id: string;
  title: string;
  detail: string | null;
  directive_type: "National Ops Directive" | "Scheduled Directive" | "To Do";
  priority: string;
  status: string;
  due_at: string | null;
  region?: { name: string } | { name: string }[] | null;
};

type RegionRow = {
  id: string;
  name: string;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function severityForAction(action: ActionRow): Status {
  if (action.priority === "urgent" || action.priority === "high" || action.directive_type === "National Ops Directive") return "red";
  if (action.directive_type === "Scheduled Directive") return "amber";
  return "blue";
}

function displayDueDate(value: string | null) {
  if (!value) return "No due date set";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function normalisePriority(value: string) {
  if (value === "urgent" || value === "high" || value === "normal" || value === "low") return value;
  return "normal";
}

function normaliseDirective(value: string) {
  if (value === "National Ops Directive" || value === "Scheduled Directive" || value === "To Do") return value;
  return "Scheduled Directive";
}

function normaliseStatus(value: string) {
  const allowed = ["not_started", "in_progress", "complete", "blocked", "open"];
  return allowed.includes(value) ? value : "open";
}

function displayRegisterStatus(value: string) {
  const labels: Record<string, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    complete: "Complete",
    blocked: "Blocked",
    open: "Open"
  };

  return labels[value] || value;
}

async function getRegionId(regionName: string) {
  if (!regionName || regionName === "National") return null;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("regions")
    .select("id,name")
    .eq("name", regionName)
    .maybeSingle();

  if (error) throw error;
  return (data as RegionRow | null)?.id || null;
}

function dueToIso(value: string | null | undefined) {
  return value ? new Date(`${value}T17:00:00+10:00`).toISOString() : null;
}

function mapAction(action: ActionRow) {
  const region = firstRelated(action.region);
  const severity = severityForAction(action);

  return {
    id: action.id,
    title: action.title,
    source: "Compliance",
    directive: action.directive_type,
    region: region?.name || "National",
    severity,
    dueDate: displayDueDate(action.due_at),
    href: `/actions/${action.id}`,
    detail: action.detail || "Compliance action requires manager close-out.",
    status: action.status === "submitted_for_review" ? "Awaiting national review" : action.status === "returned_to_manager" ? "Returned to manager" : "Open"
  };
}

function mapRegisterItem(item: ComplianceRow) {
  const region = firstRelated(item.region);

  return {
    id: item.id,
    title: item.title,
    detail: item.detail || "No additional compliance detail supplied.",
    region: region?.name || "National",
    status: displayRegisterStatus(item.status),
    dueDate: displayDueDate(item.due_at),
    actionHref: item.linked_action_id ? `/actions/${item.linked_action_id}` : "/compliance"
  };
}

export async function GET() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ actions: [], register: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const [{ data: actionData, error: actionError }, { data: registerData, error: registerError }] = await Promise.all([
    supabase
      .from("action_items")
      .select("id,title,detail,directive_type,priority,status,due_at,region:regions(name)")
      .ilike("source_page", "compliance")
      .neq("status", "closed")
      .order("created_at", { ascending: false }),
    supabase
      .from("compliance_items")
      .select("id,title,detail,status,due_at,linked_action_id,region:regions(name)")
      .order("created_at", { ascending: false })
  ]);

  if (actionError || registerError) {
    return NextResponse.json({ actions: [], register: [], connected: false, error: actionError?.message || registerError?.message }, { status: 500 });
  }

  return NextResponse.json({
    actions: ((actionData as ActionRow[] | null) || []).map(mapAction),
    register: ((registerData as ComplianceRow[] | null) || []).map(mapRegisterItem),
    connected: true
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ actions: [], register: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "create") {
    const title = String(payload.title || "").trim();
    if (!title) return NextResponse.json({ error: "Compliance title is required." }, { status: 400 });

    const regionId = await getRegionId(payload.region || "National");
    const dueAt = dueToIso(payload.dueDate);
    const detail = payload.detail || "Compliance action requires manager close-out.";

    const { data: registerItem, error: registerError } = await supabase
      .from("compliance_items")
      .insert({
        title,
        detail,
        region_id: regionId,
        status: normaliseStatus(payload.status || "open"),
        due_at: dueAt
      })
      .select("id")
      .single();

    if (registerError) return NextResponse.json({ error: registerError.message }, { status: 500 });

    const { data: actionItem, error: actionError } = await supabase
      .from("action_items")
      .insert({
        title,
        detail,
        source_page: "compliance",
        directive_type: normaliseDirective(payload.directiveType || "Scheduled Directive"),
        priority: normalisePriority(payload.priority || "normal"),
        status: "open",
        assigned_region_id: regionId,
        due_at: dueAt
      })
      .select("id")
      .single();

    if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });

    const { error: linkError } = await supabase
      .from("compliance_items")
      .update({ linked_action_id: actionItem.id, updated_at: new Date().toISOString() })
      .eq("id", registerItem.id);

    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
    return GET();
  }

  if (action === "update") {
    if (!payload.id) return NextResponse.json({ error: "Compliance item id is required." }, { status: 400 });
    const updates = payload.updates || {};
    const dbUpdates: Record<string, string | null> = { updated_at: new Date().toISOString() };
    const actionUpdates: Record<string, string | null> = { updated_at: new Date().toISOString() };

    if (typeof updates.title === "string") {
      dbUpdates.title = updates.title.trim();
      actionUpdates.title = updates.title.trim();
    }
    if (typeof updates.detail === "string") {
      dbUpdates.detail = updates.detail;
      actionUpdates.detail = updates.detail;
    }
    if (typeof updates.status === "string") dbUpdates.status = normaliseStatus(updates.status);
    if (typeof updates.dueDate === "string") {
      dbUpdates.due_at = dueToIso(updates.dueDate);
      actionUpdates.due_at = dueToIso(updates.dueDate);
    }
    if (typeof updates.region === "string") {
      const regionId = await getRegionId(updates.region);
      dbUpdates.region_id = regionId;
      actionUpdates.assigned_region_id = regionId;
    }
    if (typeof updates.directiveType === "string") actionUpdates.directive_type = normaliseDirective(updates.directiveType);
    if (typeof updates.priority === "string") actionUpdates.priority = normalisePriority(updates.priority);

    const { data: item, error: readError } = await supabase
      .from("compliance_items")
      .select("linked_action_id")
      .eq("id", payload.id)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const { error } = await supabase.from("compliance_items").update(dbUpdates).eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (item?.linked_action_id) {
      const { error: actionError } = await supabase.from("action_items").update(actionUpdates).eq("id", item.linked_action_id);
      if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    return GET();
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "Compliance item id is required." }, { status: 400 });

    const { data: item, error: readError } = await supabase
      .from("compliance_items")
      .select("linked_action_id")
      .eq("id", payload.id)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const { error } = await supabase.from("compliance_items").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (item?.linked_action_id) {
      const { error: actionError } = await supabase.from("action_items").delete().eq("id", item.linked_action_id);
      if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    return GET();
  }

  return NextResponse.json({ error: "Unsupported compliance operation." }, { status: 400 });
}
