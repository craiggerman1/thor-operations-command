import { NextResponse } from "next/server";
import { clearComplianceForDeletedActions, markComplianceForClosedActions, reopenComplianceForReturnedActions } from "@/lib/linked-record-sync";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocNationalAccess, requireTocScope } from "@/lib/toc-auth";
import { createOdinDirectActionItems } from "@/lib/odin-actions";
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
  created_at: string;
  updated_at: string;
  region?: { name: string } | { name: string }[] | null;
};

type RegionRow = {
  id: string;
  name: string;
};

type ComplianceBacklogRow = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  due_at: string | null;
  linked_action_id: string | null;
  region_id: string | null;
};

type OdinBacklogRow = {
  id: string;
  item_type: string;
  title: string;
  summary: string | null;
  region: string;
  severity: string;
  confidence: number;
  noticed: string | null;
  why_it_matters: string | null;
  recommended_action: string | null;
  due_at: string | null;
  payload?: Record<string, unknown> | null;
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

function normaliseSourcePage(value: string) {
  const map: Record<string, string> = {
    "Action Centre": "action-centre",
    Compliance: "compliance",
    Productivity: "productivity",
    "Equipment Servicing": "equipment-servicing",
    "Stock Orders": "stock-orders",
    Jobsheets: "jobsheets",
    "Thor Portal": "jobsheets",
    Calendar: "calendar",
    "Staff Availability": "staff-availability",
    "To Do": "to-do"
  };

  return map[value] || value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "action-centre";
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

function hoursSince(value: string | null | undefined, now = new Date()) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3600000));
}

function actionAgeLabel(hours: number) {
  if (hours < 1) return "Just raised";
  if (hours < 24) return `${hours}h open`;
  const days = Math.floor(hours / 24);
  return `${days}d open`;
}

function isDueSoon(value: string | null, now = new Date()) {
  if (!value) return false;
  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) return false;
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  return dueDate.getTime() >= now.getTime() && dueDate.getTime() <= now.getTime() + threeDays;
}

function isOverdue(value: string | null, now = new Date()) {
  if (!value) return false;
  const dueDate = new Date(value);
  return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < now.getTime();
}

function closureSignalForAction(row: ActionRow, now = new Date()) {
  const ageHours = hoursSince(row.created_at, now);
  const staleHours = hoursSince(row.updated_at || row.created_at, now);
  const overdue = isOverdue(row.due_at, now);
  const stale = staleHours >= 24 && row.status === "open";
  const returned = row.status === "returned_to_manager";
  const submitted = row.status === "submitted_for_review";
  const urgent = row.priority === "urgent" || row.directive_type === "National Ops Directive";
  const carryover = overdue || stale || returned;
  const escalationLevel = overdue && urgent
    ? "craig"
    : overdue || returned || staleHours >= 48
      ? "national"
      : stale || submitted || isDueSoon(row.due_at, now)
        ? "watch"
        : "none";
  const escalationLabel = escalationLevel === "craig"
    ? "Craig escalation"
    : escalationLevel === "national"
      ? "National follow-up"
      : escalationLevel === "watch"
        ? "Watch"
        : "On track";

  return {
    ageHours,
    staleHours,
    ageLabel: actionAgeLabel(ageHours),
    staleLabel: staleHours < 1 ? "Updated just now" : `${actionAgeLabel(staleHours).replace("open", "since update")}`,
    isOverdue: overdue,
    isDueSoon: isDueSoon(row.due_at, now),
    isStale: stale,
    isCarryover: carryover,
    escalationLevel,
    escalationLabel,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dueAt: row.due_at
  };
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

async function ensureComplianceActions() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const { data } = await supabase
    .from("compliance_items")
    .select("id,title,detail,status,due_at,linked_action_id,region_id")
    .is("linked_action_id", null)
    .neq("status", "complete")
    .limit(25);

  const backlog = (data as ComplianceBacklogRow[] | null) || [];
  for (const item of backlog) {
    const { data: actionItem, error: actionError } = await supabase
      .from("action_items")
      .insert({
        title: item.title,
        detail: item.detail || "Compliance action requires manager close-out.",
        source_page: "compliance",
        directive_type: "National Ops Directive",
        priority: item.status === "blocked" ? "urgent" : "high",
        status: "open",
        assigned_region_id: item.region_id,
        due_at: item.due_at
      })
      .select("id")
      .single();

    if (!actionError && actionItem?.id) {
      await supabase
        .from("compliance_items")
        .update({ linked_action_id: actionItem.id, updated_at: new Date().toISOString() })
        .eq("id", item.id);
    }
  }
}

async function promoteActionableOdinItems() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const { data } = await supabase
    .from("odin_items")
    .select("id,item_type,title,summary,region,severity,confidence,noticed,why_it_matters,recommended_action,due_at,payload")
    .eq("status", "pending")
    .in("item_type", ["alert", "recommendation", "follow_up", "action_request"])
    .in("severity", ["red", "amber"])
    .limit(25);

  const backlog = (data as OdinBacklogRow[] | null) || [];
  for (const item of backlog) {
    const existingPayload = item.payload || {};
    if (Array.isArray(existingPayload.createdActionIds) && existingPayload.createdActionIds.length) continue;

    try {
      const result = await createOdinDirectActionItems({
        actorKind: "odin",
        payload: {
          title: item.title,
          detail: item.recommended_action || item.summary || "Odin raised this operational item for manager close-out.",
          summary: item.summary || item.title,
          region: existingPayload.targetRegions || item.region,
          targetRegions: existingPayload.targetRegions || item.region,
          directiveType: existingPayload.directiveType || "National Ops Directive",
          priority: existingPayload.priority || (item.severity === "red" ? "urgent" : "high"),
          severity: item.severity,
          confidence: item.confidence,
          noticed: item.noticed || "Odin identified this item from the TOC operational snapshot.",
          whyItMatters: item.why_it_matters || "The item needs manager visibility and close-out in Action Centre.",
          sourcePage: existingPayload.sourcePage || "Action Centre",
          dueAt: item.due_at
        }
      });

      await supabase
        .from("odin_items")
        .update({
          approval_required: false,
          status: "approved",
          updated_at: new Date().toISOString(),
          payload: {
            ...existingPayload,
            createdActionIds: result.createdActionIds,
            promotedToActionCentre: true,
            replacementOdinItemId: result.odinItemId
          }
        })
        .eq("id", item.id);
    } catch {
      // Leave the Odin item pending if it cannot be safely mapped to a real region/action.
    }
  }
}

function mapAction(row: ActionRow) {
  const source = titleCase(row.source_page || "Action Centre");
  const region = firstRelated(row.region);
  const severity = severityForAction(row);
  const closureSignal = closureSignalForAction(row);

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
    ...closureSignal,
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
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const scopePermission = await requireTocScope(request, url.searchParams.get("scope") || (id ? null : "National"));
  if (scopePermission.error) return scopePermission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ actions: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const permittedScope = scopePermission.scope;
  if (!id) {
    await Promise.all([ensureComplianceActions(), promoteActionableOdinItems()]);
  }

  let query = supabase
    .from("action_items")
    .select("id,title,detail,source_page,directive_type,priority,status,due_at,created_at,updated_at,region:regions(name)")
    .order("created_at", { ascending: false });

  if (id) query = query.eq("id", id);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ actions: [], connected: false, error: error.message }, { status: 500 });
  }

  const actions = ((data as ActionRow[] | null) || [])
    .map(mapAction)
    .filter((action) => permittedScope === "National" || action.region === permittedScope);

  return NextResponse.json({ actions, connected: true });
}

export async function POST(request: Request) {
  const permission = await requireTocNationalAccess(request);
  if (permission.error) return permission.error;

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
      source_page: normaliseSourcePage(payload.sourcePage || "Action Centre"),
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
    if (typeof updates.sourcePage === "string") dbUpdates.source_page = normaliseSourcePage(updates.sourcePage);
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
    if (dbUpdates.status === "closed") {
      await markComplianceForClosedActions([payload.id]);
    } else if (dbUpdates.status === "returned_to_manager" || dbUpdates.status === "open") {
      await reopenComplianceForReturnedActions([payload.id]);
    }
    return GET(request);
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "Action id is required." }, { status: 400 });
    await clearComplianceForDeletedActions([payload.id]);
    const { error } = await supabase.from("action_items").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(request);
  }

  return NextResponse.json({ error: "Unsupported action item operation." }, { status: 400 });
}
