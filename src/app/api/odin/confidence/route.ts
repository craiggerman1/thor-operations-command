import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { buildOdinRosterGaps } from "@/lib/odin-roster-gaps";
import { readOdinStaffEntities } from "@/lib/odin-staff";

type Severity = "red" | "amber" | "blue";
type IssueCategory = "ownership" | "lifecycle" | "routing" | "source" | "duplicate" | "staff" | "roster";
type DataRow = Record<string, unknown>;

type ConfidenceIssue = {
  id: string;
  title: string;
  detail: string;
  category: IssueCategory;
  severity: Severity;
  page: string;
  href: string;
  recommendedAction: string;
};

type ReadResult = {
  rows: DataRow[];
  error: string | null;
};

const activeActionStatuses = ["open", "acknowledged", "in_progress", "blocked", "submitted_for_review", "returned_to_manager", "reopened", "escalated"];
const activeComplianceStatuses = ["open", "in_progress", "blocked", "not_started"];
const activeEquipmentStatuses = ["watch", "service_due", "overdue"];
const activeStockStatuses = ["submitted", "awaiting_review", "approved", "ordered", "dispatched", "cancel_requested", "returned"];

function firstRelated(value: unknown): DataRow | null {
  if (Array.isArray(value)) return (value[0] as DataRow | undefined) || null;
  return value && typeof value === "object" ? value as DataRow : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function regionName(row: DataRow) {
  const region = firstRelated(row.region);
  return text(region?.name, text(row.owner_scope, "National"));
}

function isOverdue(value: unknown, now: Date) {
  if (!value) return false;
  const date = new Date(String(value));
  return !Number.isNaN(date.getTime()) && date < now;
}

function hoursSince(value: unknown, now: Date) {
  if (!value) return 0;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3600000));
}

function issue(input: ConfidenceIssue) {
  return input;
}

function scoreFromIssues(issues: ConfidenceIssue[]) {
  const counts = countBySeverity(issues);
  const penalty = (counts.red * 12) + (counts.amber * 5) + Math.min(counts.blue, 12);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function countBySeverity(issues: ConfidenceIssue[]) {
  return issues.reduce<Record<Severity, number>>((lookup, item) => {
    lookup[item.severity] += 1;
    return lookup;
  }, { red: 0, amber: 0, blue: 0 });
}

function countByCategory(issues: ConfidenceIssue[]) {
  return issues.reduce<Record<IssueCategory, number>>((lookup, item) => {
    lookup[item.category] = (lookup[item.category] || 0) + 1;
    return lookup;
  }, {} as Record<IssueCategory, number>);
}

function countActionsByStatus(actions: DataRow[]) {
  return actions.reduce<Record<string, number>>((lookup, row) => {
    const status = text(row.status, "unknown");
    lookup[status] = (lookup[status] || 0) + 1;
    return lookup;
  }, {});
}

async function readRows(table: string, select: string, options: { limit?: number; orderBy?: string; statuses?: { column: string; values: string[] } } = {}): Promise<ReadResult> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { rows: [], error: "Supabase server key is not configured." };

  let query = supabase
    .from(table)
    .select(select)
    .order(options.orderBy || "created_at", { ascending: false })
    .limit(options.limit || 500);

  if (options.statuses) query = query.in(options.statuses.column, options.statuses.values);

  const { data, error } = await query;
  return { rows: (data || []) as unknown as DataRow[], error: error?.message || null };
}

function sourceIssues(results: Record<string, ReadResult>) {
  return Object.entries(results)
    .filter(([, result]) => result.error)
    .map(([name, result]) => issue({
      id: `source:${name}`,
      title: `${name} source read issue`,
      detail: result.error || "Source could not be read.",
      category: "source",
      severity: "red",
      page: "Admin Settings",
      href: "/admin/settings/odin-confidence",
      recommendedAction: "Check Supabase table access, RLS, service key and the API select fields for this source."
    }));
}

function duplicateActionIssues(actions: DataRow[]) {
  const openActions = actions.filter((row) => activeActionStatuses.includes(text(row.status)));
  const groups = openActions.reduce<Record<string, DataRow[]>>((lookup, row) => {
    const key = [
      regionName(row).toLowerCase(),
      text(row.source_page, "action").toLowerCase(),
      text(row.title, "untitled").toLowerCase(),
      String(row.due_at || "no_due")
    ].join("|");
    lookup[key] = [...(lookup[key] || []), row];
    return lookup;
  }, {});

  return Object.entries(groups)
    .filter(([, rows]) => rows.length > 1)
    .slice(0, 12)
    .map(([key, rows]) => issue({
      id: `duplicate:action:${key}`,
      title: `${rows.length} similar open Action Centre items`,
      detail: `${text(rows[0].title, "Untitled action")} appears multiple times for ${regionName(rows[0])}.`,
      category: "duplicate",
      severity: rows.length >= 3 ? "red" : "amber",
      page: "Action Centre",
      href: "/actions",
      recommendedAction: "Merge, close or delete duplicates so Odin does not keep chasing the same operational issue."
    }));
}

function linkedRecordIssues(rows: DataRow[], actionIds: Set<string>, input: { type: "compliance" | "equipment" | "productivity"; href: string; titleField: string }) {
  return rows.flatMap((row) => {
    const linkedActionId = text(row.linked_action_id);
    const title = text(row[input.titleField], "Untitled linked record");
    const status = text(row.status || row.current_status);
    const issues: ConfidenceIssue[] = [];

    if (!linkedActionId) {
      issues.push(issue({
        id: `${input.type}:missing-action:${row.id}`,
        title: `${title} has no linked Action Centre close-out`,
        detail: `${regionName(row)} ${input.type} record is active with status ${status || "active"} but does not have a manager close-out action linked.`,
        category: "routing",
        severity: input.type === "compliance" ? "red" : "amber",
        page: input.type === "productivity" ? "Productivity" : input.type === "equipment" ? "Equipment Servicing" : "Compliance",
        href: input.href,
        recommendedAction: "Create or repair the linked Action Centre item so the manager has a close-out path."
      }));
    } else if (!actionIds.has(linkedActionId)) {
      issues.push(issue({
        id: `${input.type}:orphan-action:${row.id}`,
        title: `${title} links to a missing action`,
        detail: `Linked action ${linkedActionId.slice(0, 8)} could not be found in Action Centre.`,
        category: "routing",
        severity: "red",
        page: input.type === "productivity" ? "Productivity" : input.type === "equipment" ? "Equipment Servicing" : "Compliance",
        href: input.href,
        recommendedAction: "Repair the link by creating a new close-out action or clearing the stale linked action id."
      }));
    }

    return issues;
  });
}

function actionQualityIssues(actions: DataRow[], now: Date) {
  return actions.filter((row) => activeActionStatuses.includes(text(row.status))).flatMap((row) => {
    const title = text(row.title, "Untitled action");
    const href = `/actions/${row.id}`;
    const issues: ConfidenceIssue[] = [];
    const region = regionName(row);

    if (!row.region && !row.assigned_region_id) {
      issues.push(issue({
        id: `action:no-region:${row.id}`,
        title: `${title} has no region owner`,
        detail: "Action Centre item is open but does not clearly map to a region owner.",
        category: "ownership",
        severity: "red",
        page: "Action Centre",
        href,
        recommendedAction: "Assign a region or owner so Odin and National know who is accountable."
      }));
    }

    if (!row.due_at) {
      issues.push(issue({
        id: `action:no-due:${row.id}`,
        title: `${title} has no due date`,
        detail: `${region} action is open without a due date, which weakens overdue and escalation logic.`,
        category: "lifecycle",
        severity: "amber",
        page: "Action Centre",
        href,
        recommendedAction: "Set a due date so Odin can age, carry over and escalate it correctly."
      }));
    } else if (isOverdue(row.due_at, now)) {
      issues.push(issue({
        id: `action:overdue:${row.id}`,
        title: `${title} is overdue`,
        detail: `${region} action passed its due date and remains open.`,
        category: "lifecycle",
        severity: "red",
        page: "Action Centre",
        href,
        recommendedAction: "Review the manager close-out status and escalate if there is no valid response."
      }));
    }

    if (hoursSince(row.updated_at || row.created_at, now) >= 48) {
      issues.push(issue({
        id: `action:stale:${row.id}`,
        title: `${title} has not moved in 48h`,
        detail: `${region} action is stale and may need manager follow-up.`,
        category: "lifecycle",
        severity: "amber",
        page: "Action Centre",
        href,
        recommendedAction: "Ask the owner for an update or mark blocked if there is a dependency."
      }));
    }

    return issues;
  });
}

function calendarIssues(jobs: DataRow[]) {
  return jobs.flatMap((job) => {
    const title = text(job.job_title || job.site || job.location, "Calendar job");
    const issues: ConfidenceIssue[] = [];

    if (!text(job.site)) {
      issues.push(issue({
        id: `calendar:no-site:${job.id}`,
        title: `${title} has no site mapped`,
        detail: "Calendar job is missing a site value, which weakens roster, induction and client/site risk checks.",
        category: "source",
        severity: "amber",
        page: "Calendar",
        href: "/calendar",
        recommendedAction: "Add the site name or map the job source so Odin can check inductions and site suitability."
      }));
    }

    if (!text(job.crew)) {
      issues.push(issue({
        id: `calendar:no-crew:${job.id}`,
        title: `${title} has no crew assigned`,
        detail: "Calendar job is missing crew data, so Odin cannot verify coverage.",
        category: "roster",
        severity: "amber",
        page: "Calendar",
        href: "/calendar",
        recommendedAction: "Assign crew or expected crew count so roster-gap detection can run accurately."
      }));
    }

    if (!text(job.location)) {
      issues.push(issue({
        id: `calendar:no-location:${job.id}`,
        title: `${title} has no location`,
        detail: "Calendar job is missing location, which weakens weather and regional planning.",
        category: "source",
        severity: "blue",
        page: "Calendar",
        href: "/calendar",
        recommendedAction: "Add a location or standard region mapping."
      }));
    }

    return issues;
  });
}

function staffIssues(staffResult: Awaited<ReturnType<typeof readOdinStaffEntities>>) {
  const issues: ConfidenceIssue[] = [];

  if (!staffResult.connected) {
    issues.push(issue({
      id: "staff:source-fallback",
      title: "Staff register is using fallback sheet entities",
      detail: staffResult.error || "Database staff profiles are not the active source.",
      category: "staff",
      severity: "amber",
      page: "Staff Register",
      href: "/admin/settings/staff-register",
      recommendedAction: "Review staff profiles so Odin has stable staff IDs, roles, regions and protected contact mappings."
    }));
  }

  staffResult.staff.forEach((person) => {
    if (!person.regions.length || person.regions.includes("Unassigned")) {
      issues.push(issue({
        id: `staff:no-region:${person.id}`,
        title: `${person.name} has no assigned region`,
        detail: "Staff member cannot be reliably matched into region roster logic.",
        category: "staff",
        severity: "amber",
        page: "Staff Register",
        href: "/admin/settings/staff-register",
        recommendedAction: "Assign a primary region and any additional regions of responsibility."
      }));
    }

    if (!person.skills.length) {
      issues.push(issue({
        id: `staff:no-skills:${person.id}`,
        title: `${person.name} has no skills mapped`,
        detail: "Odin can still reason from availability and inductions, but roster suggestions are weaker without skills.",
        category: "staff",
        severity: "blue",
        page: "Staff Register",
        href: "/admin/settings/staff-register",
        recommendedAction: "Add relevant skills such as wash hand, team leader, HR, chemical handling or site-specific capability."
      }));
    }

    if (!person.availability.totalWindows) {
      issues.push(issue({
        id: `staff:no-availability:${person.id}`,
        title: `${person.name} has no availability windows`,
        detail: "Odin cannot confidently suggest this staff member for upcoming work.",
        category: "staff",
        severity: "amber",
        page: "Staff Availability",
        href: "/staff-availability",
        recommendedAction: "Check the staff availability sheet name mapping and source row."
      }));
    }

    if (!person.inductions.records.length) {
      issues.push(issue({
        id: `staff:no-inductions:${person.id}`,
        title: `${person.name} has no induction records`,
        detail: "Odin cannot verify site eligibility for this staff member.",
        category: "staff",
        severity: "amber",
        page: "Inductions",
        href: "/inductions",
        recommendedAction: "Check the induction sheet name mapping and site induction source."
      }));
    }
  });

  return issues.slice(0, 80);
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const generatedAt = new Date();
  const [
    actions,
    compliance,
    equipment,
    productivity,
    stockOrders,
    stockCatalog,
    calendarJobs,
    staffResult,
    rosterGaps
  ] = await Promise.all([
    readRows("action_items", "id,title,status,source_page,directive_type,priority,due_at,assigned_region_id,assigned_profile_id,created_at,updated_at,region:regions(name)", { statuses: { column: "status", values: activeActionStatuses }, limit: 1000 }),
    readRows("compliance_items", "id,title,status,due_at,linked_action_id,created_at,updated_at,region:regions(name)", { statuses: { column: "status", values: activeComplianceStatuses }, limit: 1000 }),
    readRows("equipment_assets", "id,asset_name,asset_type,current_status,next_service_due,service_note,linked_action_id,updated_at,region:regions(name)", { statuses: { column: "current_status", values: activeEquipmentStatuses }, limit: 1000, orderBy: "updated_at" }),
    readRows("productivity_sites", "id,site_name,productivity_score,latest_note,linked_action_id,created_at,updated_at,region:regions(name)", { limit: 1000, orderBy: "updated_at" }),
    readRows("stock_orders", "id,item_id,quantity,urgency,note,status,created_at,updated_at,region:regions(name),item:stock_order_items(item_name,is_active)", { statuses: { column: "status", values: activeStockStatuses }, limit: 1000 }),
    readRows("stock_order_items", "id,item_name,is_active,created_at", { limit: 1000 }),
    readRows("calendar_jobs", "id,job_date,job_time,location,site,crew,job_title,status,severity,updated_at,created_at", { limit: 1000, orderBy: "job_date" }),
    readOdinStaffEntities({ includeProtected: false }),
    buildOdinRosterGaps()
  ]);

  const actionIds = new Set(actions.rows.map((row) => text(row.id)).filter(Boolean));
  const productivityRisk = productivity.rows.filter((row) => Number(row.productivity_score) < 80);
  const issues = [
    ...sourceIssues({ actions, compliance, equipment, productivity, stockOrders, stockCatalog, calendarJobs }),
    ...actionQualityIssues(actions.rows, generatedAt),
    ...duplicateActionIssues(actions.rows),
    ...linkedRecordIssues(compliance.rows, actionIds, { type: "compliance", href: "/compliance", titleField: "title" }),
    ...linkedRecordIssues(equipment.rows, actionIds, { type: "equipment", href: "/equipment-servicing", titleField: "asset_name" }),
    ...linkedRecordIssues(productivityRisk, actionIds, { type: "productivity", href: "/operations", titleField: "site_name" }),
    ...calendarIssues(calendarJobs.rows),
    ...staffIssues(staffResult)
  ];

  if (!stockCatalog.rows.some((row) => row.is_active === true)) {
    issues.push(issue({
      id: "stock:no-active-catalogue",
      title: "No active stock catalogue items",
      detail: "Stock routing needs active approved catalogue items before Odin can create stock orders reliably.",
      category: "routing",
      severity: "red",
      page: "Stock Orders",
      href: "/admin/settings/stock-orders",
      recommendedAction: "Add or activate approved stock catalogue items."
    }));
  }

  stockOrders.rows.forEach((order) => {
    const item = firstRelated(order.item);
    if (!order.item_id || !item || item.is_active === false) {
      issues.push(issue({
        id: `stock:unmatched-item:${order.id}`,
        title: "Stock order has weak item mapping",
        detail: `${regionName(order)} stock order does not map to an active approved catalogue item.`,
        category: "routing",
        severity: "amber",
        page: "Stock Orders",
        href: "/stock-orders",
        recommendedAction: "Match the order to an active catalogue item or update the approved catalogue."
      }));
    }
  });

  if (!rosterGaps.connected) {
    issues.push(issue({
      id: "roster:gap-source",
      title: "Roster gap detection source issue",
      detail: rosterGaps.errors.join("; ") || "Roster gap detection did not return a connected result.",
      category: "roster",
      severity: "amber",
      page: "Staff Availability",
      href: "/staff-availability",
      recommendedAction: "Review calendar job source, staff source and roster-gap API health."
    }));
  }

  const visibleIssues = issues.sort((a, b) => {
    const severityRank = { red: 0, amber: 1, blue: 2 };
    return severityRank[a.severity] - severityRank[b.severity] || a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
  });
  const severityCounts = countBySeverity(visibleIssues);
  const categoryCounts = countByCategory(visibleIssues);
  const actionStatusCounts = countActionsByStatus(actions.rows);

  return NextResponse.json({
    connected: true,
    generatedAt: generatedAt.toISOString(),
    actor: permission.kind,
    confidenceScore: scoreFromIssues(visibleIssues),
    summary: {
      issueCount: visibleIssues.length,
      severityCounts,
      categoryCounts,
      actionStatusCounts,
      blockedActions: actionStatusCounts.blocked || 0,
      inProgressActions: actionStatusCounts.in_progress || 0,
      submittedForReviewActions: actionStatusCounts.submitted_for_review || 0,
      acknowledgedActions: actionStatusCounts.acknowledged || 0,
      openActions: actions.rows.length,
      activeCompliance: compliance.rows.length,
      activeEquipment: equipment.rows.length,
      activeStockOrders: stockOrders.rows.length,
      activeStockCatalogItems: stockCatalog.rows.filter((row) => row.is_active === true).length,
      calendarJobsLoaded: calendarJobs.rows.length,
      staffLoaded: staffResult.staff.length,
      rosterGapCount: rosterGaps.gapCount || 0
    },
    sections: {
      critical: visibleIssues.filter((item) => item.severity === "red"),
      dataMapping: visibleIssues.filter((item) => ["ownership", "routing", "duplicate"].includes(item.category)),
      sourceHealth: visibleIssues.filter((item) => ["source", "staff", "roster"].includes(item.category)),
      lifecycle: visibleIssues.filter((item) => item.category === "lifecycle")
    },
    issues: visibleIssues.slice(0, 160)
  });
}
