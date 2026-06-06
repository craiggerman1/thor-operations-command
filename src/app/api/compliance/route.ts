import { NextResponse } from "next/server";
import {
  addComplianceInterval,
  createRecurringComplianceOccurrence,
  dueToIso,
  ensureRecurringComplianceActions,
  getRegionId,
  normaliseCadence,
  normaliseIntervalMonths
} from "@/lib/compliance-recurrence";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocNationalAccess, requireTocScope } from "@/lib/toc-auth";
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

type ComplianceScheduleRow = {
  id: string;
  title: string;
  detail: string | null;
  directive_type: string;
  priority: string;
  cadence: "weekly" | "monthly" | "annual";
  interval_months: number | null;
  next_due_at: string;
  last_generated_at: string | null;
  active: boolean;
  region?: { name: string } | { name: string }[] | null;
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

function scopedRequest(request: Request, payload: Record<string, unknown>) {
  const url = new URL(request.url);
  if (payload.all === true) {
    url.searchParams.set("all", "true");
  } else if (typeof payload.scope === "string" && payload.scope) {
    url.searchParams.set("scope", payload.scope);
  }

  return new Request(url, { method: "GET", headers: request.headers });
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
    status: action.status === "submitted_for_review"
      ? "Resolved pending review"
      : action.status === "returned_to_manager"
        ? "Returned to manager"
        : action.status === "blocked"
          ? "Blocked"
          : action.status === "in_progress"
            ? "In progress"
            : "Open"
  };
}

function displaySchedule(row: ComplianceScheduleRow) {
  const cadence = row.cadence === "weekly"
    ? "Weekly"
    : row.cadence === "annual"
      ? "Annual"
      : `Every ${row.interval_months || 1} month${(row.interval_months || 1) === 1 ? "" : "s"}`;
  const region = firstRelated(row.region);

  return {
    id: row.id,
    title: row.title,
    detail: row.detail || "Recurring compliance action requires manager close-out.",
    region: region?.name || "National",
    cadence,
    cadenceKey: row.cadence,
    intervalMonths: row.interval_months || 1,
    nextDueDate: displayDueDate(row.next_due_at),
    lastGeneratedDate: displayDueDate(row.last_generated_at),
    active: row.active,
    directive: row.directive_type,
    priority: row.priority
  };
}

async function readSchedules(showAll: boolean, scope: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("compliance_action_schedules")
      .select("id,title,detail,directive_type,priority,cadence,interval_months,next_due_at,last_generated_at,active,region:regions(name)")
      .eq("active", true)
      .order("next_due_at", { ascending: true });

    if (error) throw error;
    return ((data as ComplianceScheduleRow[] | null) || [])
      .map(displaySchedule)
      .filter((item) => showAll || item.region === scope);
  } catch {
    return [];
  }
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scopePermission = await requireTocScope(request, url.searchParams.get("scope") || (url.searchParams.get("all") === "true" ? "National" : null));
  if (scopePermission.error) return scopePermission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ actions: [], register: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const scope = scopePermission.scope;
  const showAll = url.searchParams.get("all") === "true" || scope === "National";
  await ensureRecurringComplianceActions();

  const [{ data: actionData, error: actionError }, { data: registerData, error: registerError }, schedules] = await Promise.all([
    supabase
      .from("action_items")
      .select("id,title,detail,directive_type,priority,status,due_at,region:regions(name)")
      .ilike("source_page", "compliance")
      .neq("status", "closed")
      .order("created_at", { ascending: false }),
    supabase
      .from("compliance_items")
      .select("id,title,detail,status,due_at,linked_action_id,region:regions(name)")
      .neq("status", "complete")
      .order("created_at", { ascending: false }),
    readSchedules(showAll, scope)
  ]);

  if (actionError || registerError) {
    return NextResponse.json({ actions: [], register: [], connected: false, error: actionError?.message || registerError?.message }, { status: 500 });
  }

  const actions = ((actionData as ActionRow[] | null) || []).map(mapAction).filter((item) => showAll || item.region === scope);
  const register = ((registerData as ComplianceRow[] | null) || []).map(mapRegisterItem).filter((item) => showAll || item.region === scope);

  return NextResponse.json({
    actions,
    register,
    schedules,
    connected: true
  });
}

export async function POST(request: Request) {
  const permission = await requireTocNationalAccess(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ actions: [], register: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "create") {
    const title = String(payload.title || "").trim();
    if (!title) return NextResponse.json({ error: "Compliance title is required." }, { status: 400 });

    const recurring = payload.recurring === true;
    const targetRegions = Array.isArray(payload.targetRegions)
      ? (payload.targetRegions as unknown[]).map((item) => String(item)).filter(Boolean)
      : [String(payload.region || "National")];
    const selectedRegions = recurring ? Array.from(new Set(targetRegions)) : [String(payload.region || "National")];
    const regionId = await getRegionId(selectedRegions[0] || "National");
    const dueAt = dueToIso(payload.dueDate);
    const detail = payload.detail || "Compliance action requires manager close-out.";

    if (recurring) {
      if (!dueAt) return NextResponse.json({ error: "Recurring compliance actions need a first due date." }, { status: 400 });

      const cadence = normaliseCadence(String(payload.cadence || "monthly"));
      const intervalMonths = cadence === "monthly" ? normaliseIntervalMonths(payload.intervalMonths) : 1;

      for (const regionName of selectedRegions) {
        const scheduleRegionId = await getRegionId(regionName);
        const { data: schedule, error: scheduleError } = await supabase
          .from("compliance_action_schedules")
          .insert({
            title,
            detail,
            region_id: scheduleRegionId,
            directive_type: normaliseDirective(payload.directiveType || "Scheduled Directive"),
            priority: normalisePriority(payload.priority || "normal"),
            cadence,
            interval_months: intervalMonths,
            next_due_at: addComplianceInterval(dueAt, cadence, intervalMonths),
            last_generated_at: dueAt,
            active: true
          })
          .select("id,title,detail,directive_type,priority,cadence,interval_months,region_id,next_due_at")
          .single();

        if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 });
        await createRecurringComplianceOccurrence({
          id: String(schedule.id),
          title,
          detail,
          directive_type: normaliseDirective(payload.directiveType || "Scheduled Directive"),
          priority: normalisePriority(payload.priority || "normal"),
          cadence,
          interval_months: intervalMonths,
          region_id: scheduleRegionId,
          next_due_at: dueAt
        }, dueAt);
      }

      return GET(scopedRequest(request, payload));
    }

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
    return GET(scopedRequest(request, payload));
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
    if (typeof updates.status === "string") {
      const nextStatus = normaliseStatus(updates.status);
      dbUpdates.status = nextStatus;
      actionUpdates.status = nextStatus === "complete" ? "closed" : "open";
      actionUpdates.closed_at = nextStatus === "complete" ? new Date().toISOString() : null;
    }
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

    return GET(scopedRequest(request, payload));
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

    return GET(scopedRequest(request, payload));
  }

  return NextResponse.json({ error: "Unsupported compliance operation." }, { status: 400 });
}
