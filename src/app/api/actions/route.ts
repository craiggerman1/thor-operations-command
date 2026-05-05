import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { Status } from "@/lib/toc-data";

type ActionStatus = "open" | "submitted_for_review" | "returned_to_manager" | "closed";

type ActionRow = {
  id: string;
  title: string;
  detail: string | null;
  source_page: string;
  directive_type: "National Ops Directive" | "Scheduled Directive" | "To Do";
  priority: "urgent" | "high" | "normal" | "low";
  status: ActionStatus;
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

function titleCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceHref(source: string) {
  const map: Record<string, string> = {
    Compliance: "/compliance",
    Productivity: "/operations",
    "Equipment Servicing": "/equipment-servicing",
    "Stock Orders": "/stock-orders",
    "Thor Portal": "/jobsheets",
    Jobsheets: "/jobsheets",
    Roster: "/staff-availability",
    Calendar: "/calendar",
    "To Do": "/todo",
    Workshop: "/equipment-servicing"
  };

  return map[source] || "/actions";
}

function severityForAction(row: ActionRow): Status {
  if (row.directive_type === "National Ops Directive" || row.priority === "urgent" || row.priority === "high") return "red";
  if (row.directive_type === "Scheduled Directive") return "amber";
  return "blue";
}

function displayStatus(status: ActionStatus) {
  const labels = {
    open: "Open",
    submitted_for_review: "Awaiting national review",
    returned_to_manager: "Returned to manager",
    closed: "Closed"
  };

  return labels[status];
}

function displayDueDate(value: string | null) {
  if (!value) return "No due date set";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function normaliseDirective(value: string): ActionRow["directive_type"] {
  if (value === "National Ops Directive" || value === "Scheduled Directive" || value === "To Do") return value;
  return "Scheduled Directive";
}

function normalisePriority(value: string): ActionRow["priority"] {
  if (value === "urgent" || value === "high" || value === "normal" || value === "low") return value;
  return "normal";
}

function normaliseStatus(value: string): ActionStatus {
  if (value === "submitted_for_review" || value === "returned_to_manager" || value === "closed") return value;
  return "open";
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

function mapAction(row: ActionRow) {
  const source = titleCase(row.source_page || "Action Centre");
  const region = firstRelated(row.region);
  const severity = severityForAction(row);

  return {
    id: row.id,
    title: row.title,
    source,
    directive: row.directive_type,
    region: region?.name || "National",
    severity,
    dueDate: displayDueDate(row.due_at),
    href: `/actions/${row.id}`,
    detail: row.detail || "Action item requires manager review and close-out.",
    status: displayStatus(row.status),
    closeFlow: "Complete the required action, record the response, and submit for national approval.",
    closeActions: [
      `Open the source page: ${source}`,
      "Complete the required operational action.",
      "Record the manager response and evidence.",
      "Submit to National Requests for approval."
    ],
    sourceHref: sourceHref(source)
  };
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ actions: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  let query = supabase
    .from("action_items")
    .select("id,title,detail,source_page,directive_type,priority,status,due_at,region:regions(name)")
    .order("created_at", { ascending: false });

  if (id) query = query.eq("id", id);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ actions: [], connected: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ actions: ((data as ActionRow[] | null) || []).map(mapAction), connected: true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ actions: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "create") {
    const title = String(payload.title || "").trim();
    if (!title) return NextResponse.json({ error: "Action title is required." }, { status: 400 });

    const assignedRegionId = await getRegionId(payload.region || "National");
    const dueAt = payload.dueDate ? new Date(`${payload.dueDate}T17:00:00+10:00`).toISOString() : null;

    const { error } = await supabase.from("action_items").insert({
      title,
      detail: payload.detail || "Action item requires manager review and close-out.",
      source_page: payload.sourcePage || "Action Centre",
      directive_type: normaliseDirective(payload.directiveType || "Scheduled Directive"),
      priority: normalisePriority(payload.priority || "normal"),
      status: "open",
      assigned_region_id: assignedRegionId,
      due_at: dueAt
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(request);
  }

  if (action === "update") {
    if (!payload.id) return NextResponse.json({ error: "Action id is required." }, { status: 400 });
    const updates = payload.updates || {};
    const dbUpdates: Record<string, string | null> = { updated_at: new Date().toISOString() };

    if (typeof updates.title === "string") dbUpdates.title = updates.title.trim();
    if (typeof updates.detail === "string") dbUpdates.detail = updates.detail;
    if (typeof updates.sourcePage === "string") dbUpdates.source_page = updates.sourcePage;
    if (typeof updates.directiveType === "string") dbUpdates.directive_type = normaliseDirective(updates.directiveType);
    if (typeof updates.priority === "string") dbUpdates.priority = normalisePriority(updates.priority);
    if (typeof updates.status === "string") {
      const status = normaliseStatus(updates.status);
      dbUpdates.status = status;
      if (status === "closed") dbUpdates.closed_at = new Date().toISOString();
    }
    if (typeof updates.dueDate === "string") dbUpdates.due_at = updates.dueDate ? new Date(`${updates.dueDate}T17:00:00+10:00`).toISOString() : null;
    if (typeof updates.region === "string") dbUpdates.assigned_region_id = await getRegionId(updates.region);

    const { error } = await supabase.from("action_items").update(dbUpdates).eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(request);
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "Action id is required." }, { status: 400 });
    const { error } = await supabase.from("action_items").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(request);
  }

  return NextResponse.json({ error: "Unsupported action item operation." }, { status: 400 });
}
