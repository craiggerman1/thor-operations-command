import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { buildOdinOperationalContext, odinDedupeKey } from "@/lib/odin-operational-context";
import { buildOdinRosterGaps } from "@/lib/odin-roster-gaps";
import { readOdinStaffEntities } from "@/lib/odin-staff";

const snapshotLimit = 80;
const dueSoonDays = 3;
const activeActionStatuses = ["open", "acknowledged", "in_progress", "blocked", "submitted_for_review", "returned_to_manager", "reopened", "escalated"];
const activeNationalRequestStatuses = ["awaiting_review", "returned", "returned_to_manager", "pending"];
const activeStockStatuses = ["submitted", "awaiting_review", "cancel_requested", "update_requested"];
const activeEquipmentStatuses = ["watch", "service_due", "overdue"];
const activeOdinStatuses = ["pending"];

type SnapshotRow = Record<string, unknown>;

type SnapshotSection = {
  rows: SnapshotRow[];
  error: string | null;
};

function firstRelated(value: unknown): SnapshotRow | null {
  if (Array.isArray(value)) return (value[0] as SnapshotRow | undefined) || null;
  return value && typeof value === "object" ? value as SnapshotRow : null;
}

function regionName(row: SnapshotRow) {
  const region = firstRelated(row.region);
  return typeof region?.name === "string" ? region.name : String(row.region || row.owner_scope || "National");
}

function itemName(row: SnapshotRow) {
  const item = firstRelated(row.item);
  return typeof item?.item_name === "string" ? item.item_name : "";
}

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function isPastDue(value: unknown, generatedAt: Date) {
  if (!value) return false;
  const dueDate = new Date(String(value));
  return !Number.isNaN(dueDate.getTime()) && dueDate < generatedAt;
}

function isDueSoon(value: unknown, generatedAt: Date) {
  if (!value) return false;
  const dueDate = new Date(String(value));
  if (Number.isNaN(dueDate.getTime()) || dueDate < generatedAt) return false;
  const dueSoonCutoff = addDays(generatedAt, dueSoonDays);
  return dueDate <= dueSoonCutoff;
}

function hoursSince(value: unknown, generatedAt: Date) {
  if (!value) return 0;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((generatedAt.getTime() - date.getTime()) / 3600000));
}

function severityForAction(row: SnapshotRow) {
  const priority = String(row.priority || "").toLowerCase();
  if (row.directive_type === "National Ops Directive" || priority === "urgent" || priority === "high") return "red";
  if (row.directive_type === "Scheduled Directive" || priority === "normal") return "amber";
  return "blue";
}

function severityForCompliance(row: SnapshotRow) {
  const status = String(row.status || "").toLowerCase();
  if (status === "blocked") return "red";
  if (status === "in_progress" || status === "open" || status === "not_started") return "amber";
  return "blue";
}

function severityForEquipment(row: SnapshotRow) {
  const status = String(row.current_status || "").toLowerCase();
  if (status.includes("overdue") || status.includes("repair") || status.includes("stop")) return "red";
  if (status.includes("due") || status.includes("watch") || status.includes("book")) return "amber";
  return "blue";
}

function severityForStock(row: SnapshotRow) {
  const status = String(row.status || "").toLowerCase();
  if (status.includes("cancel")) return "red";
  if (row.urgency === "urgent" || status.includes("update")) return "amber";
  return "blue";
}

function severityForNationalRequest(row: SnapshotRow, generatedAt: Date) {
  const status = String(row.status || "").toLowerCase();
  const sourcePage = String(row.source_page || "").toLowerCase();
  const directiveType = String(row.directive_type || "").toLowerCase();
  const requestType = String(row.request_type || "").toLowerCase();
  const ageHours = hoursSince(row.updated_at || row.created_at, generatedAt);

  if (status === "returned" || status === "returned_to_manager" || directiveType.includes("national ops") || requestType.includes("urgent")) return "red";
  if (ageHours >= 24 || sourcePage.includes("compliance") || sourcePage.includes("safety")) return "amber";
  return "blue";
}

function entityLink(entityType: string, row: SnapshotRow, generatedAt: Date) {
  const region = regionName(row);
  const id = String(row.id || "");
  const due = row.due_at || row.next_service_due || row.job_date || "";
  const title = row.title || row.asset_name || row.site_name || row.job_title || itemName(row);
  const source = row.source_page || entityType;
  const severity = entityType === "action_item"
    ? severityForAction(row)
    : entityType === "compliance_item"
    ? severityForCompliance(row)
    : entityType === "equipment_asset"
    ? severityForEquipment(row)
    : entityType === "stock_order"
    ? severityForStock(row)
    : String(row.severity || "blue");
  const operationalContext = buildOdinOperationalContext({
    payload: row,
    destination: String(source || entityType),
    region,
    title: String(title || "Untitled TOC item"),
    sourcePage: String(source || entityType),
    severity,
    priority: typeof row.priority === "string" ? row.priority : null,
    dueAt: due ? String(due) : null
  });

  return {
    id,
    entityType,
    title: String(title || "Untitled TOC item"),
    region,
    status: row.status || row.current_status || (row.is_done === false ? "open" : "unknown"),
    severity,
    dueAt: due || null,
    source,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    ageHours: hoursSince(row.created_at, generatedAt),
    staleHours: hoursSince(row.updated_at || row.created_at, generatedAt),
    href: entityType === "action_item" ? `/actions/${id}` : `/api/odin/context/${entityType}/${id}`,
    contextEndpoint: `/api/odin/context/${entityType}/${id}`,
    dedupeKey: operationalContext.dedupeKey || odinDedupeKey([region, entityType, source, title, due]),
    owner: operationalContext.owner,
    ownerRegion: operationalContext.ownerRegion,
    visibility: operationalContext.visibility,
    escalationPath: operationalContext.escalationPath,
    escalationLevel: operationalContext.escalationLevel,
    interruptCraig: operationalContext.interruptCraig,
    entity: operationalContext.entity,
    issueType: operationalContext.issueType,
    category: operationalContext.category,
    isOverdue: isPastDue(due, generatedAt),
    isDueSoon: isDueSoon(due, generatedAt)
  };
}

function buildEntityLinks(sections: Record<string, SnapshotSection>, generatedAt: Date) {
  return [
    ...sections.actionItems.rows.map((row) => entityLink("action_item", row, generatedAt)),
    ...sections.complianceItems.rows.map((row) => entityLink("compliance_item", row, generatedAt)),
    ...sections.equipmentAssets.rows.map((row) => entityLink("equipment_asset", row, generatedAt)),
    ...sections.stockOrders.rows.map((row) => entityLink("stock_order", row, generatedAt)),
    ...sections.todoItems.rows.map((row) => entityLink("todo_item", row, generatedAt)),
    ...sections.calendarJobs.rows.map((row) => entityLink("calendar_job", row, generatedAt))
  ];
}

function duplicateGroups(entityLinks: ReturnType<typeof buildEntityLinks>) {
  const groups = entityLinks.reduce<Record<string, typeof entityLinks>>((lookup, link) => {
    lookup[link.dedupeKey] = [...(lookup[link.dedupeKey] || []), link];
    return lookup;
  }, {});

  return Object.entries(groups)
    .filter(([, links]) => links.length > 1)
    .map(([key, links]) => ({ key, count: links.length, links }));
}

function countByRegion(entityLinks: ReturnType<typeof buildEntityLinks>) {
  return entityLinks.reduce<Record<string, number>>((lookup, link) => {
    lookup[link.region] = (lookup[link.region] || 0) + 1;
    return lookup;
  }, {});
}

function countBySeverity(entityLinks: ReturnType<typeof buildEntityLinks>) {
  return entityLinks.reduce<Record<string, number>>((lookup, link) => {
    lookup[link.severity] = (lookup[link.severity] || 0) + 1;
    return lookup;
  }, { red: 0, amber: 0, blue: 0 });
}

function countByOwner(entityLinks: ReturnType<typeof buildEntityLinks>) {
  return entityLinks.reduce<Record<string, number>>((lookup, link) => {
    lookup[link.owner] = (lookup[link.owner] || 0) + 1;
    return lookup;
  }, {});
}

function countByEscalation(entityLinks: ReturnType<typeof buildEntityLinks>) {
  return entityLinks.reduce<Record<string, number>>((lookup, link) => {
    lookup[link.escalationLevel] = (lookup[link.escalationLevel] || 0) + 1;
    return lookup;
  }, { none: 0, watch: 0, national: 0, craig: 0 });
}

function actionClosureSummary(entityLinks: ReturnType<typeof buildEntityLinks>) {
  const actionLinks = entityLinks.filter((item) => item.entityType === "action_item");
  const stale24 = actionLinks.filter((item) => item.staleHours >= 24);
  const stale48 = actionLinks.filter((item) => item.staleHours >= 48);
  const overdue = actionLinks.filter((item) => item.isOverdue);
  const carryover = actionLinks.filter((item) => item.isOverdue || item.staleHours >= 24 || ["returned_to_manager", "blocked", "escalated", "reopened"].includes(String(item.status)));
  const statusBreakdown = actionLinks.reduce<Record<string, number>>((lookup, item) => {
    const status = String(item.status || "unknown");
    lookup[status] = (lookup[status] || 0) + 1;
    return lookup;
  }, {});
  const byOwner = actionLinks.reduce<Record<string, { owner: string; count: number; overdue: number; carryover: number }>>((lookup, item) => {
    const current = lookup[item.owner] || { owner: item.owner, count: 0, overdue: 0, carryover: 0 };
    lookup[item.owner] = {
      ...current,
      count: current.count + 1,
      overdue: current.overdue + (item.isOverdue ? 1 : 0),
      carryover: current.carryover + (item.isOverdue || item.staleHours >= 24 ? 1 : 0)
    };
    return lookup;
  }, {});

  return {
    openActionCount: actionLinks.length,
    stale24Count: stale24.length,
    stale48Count: stale48.length,
    overdueCount: overdue.length,
    carryoverCount: carryover.length,
    statusBreakdown,
    blockedCount: statusBreakdown.blocked || 0,
    inProgressCount: statusBreakdown.in_progress || 0,
    acknowledgedCount: statusBreakdown.acknowledged || 0,
    submittedForReviewCount: statusBreakdown.submitted_for_review || 0,
    managerWorkload: Object.values(byOwner).sort((a, b) => b.overdue - a.overdue || b.carryover - a.carryover || b.count - a.count),
    carryoverItems: carryover,
    staleItems: [...new Set([...stale48, ...stale24])].slice(0, 20)
  };
}

function buildNationalReviewSummary(rows: SnapshotRow[], generatedAt: Date) {
  const items = rows.map((row) => {
    const id = String(row.id || "");
    const region = regionName(row);
    const title = String(row.title || row.request_type || "National request awaiting review");
    const status = String(row.status || "awaiting_review");
    const ageHours = hoursSince(row.created_at, generatedAt);
    const staleHours = hoursSince(row.updated_at || row.created_at, generatedAt);
    const severity = severityForNationalRequest(row, generatedAt);

    return {
      id,
      title,
      region,
      status,
      requestType: row.request_type || null,
      sourcePage: row.source_page || null,
      sourceActionId: row.source_action_id || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      ageHours,
      staleHours,
      stale: staleHours >= 24,
      returned: status === "returned" || status === "returned_to_manager",
      severity,
      href: "/national-requests",
      dedupeKey: odinDedupeKey(["national-review", region, row.request_type, row.source_action_id || id])
    };
  });
  const staleItems = items.filter((item) => item.stale);
  const returnedItems = items.filter((item) => item.returned);
  const redItems = items.filter((item) => item.severity === "red");
  const byRegion = items.reduce<Record<string, number>>((lookup, item) => {
    lookup[item.region] = (lookup[item.region] || 0) + 1;
    return lookup;
  }, {});

  return {
    openCount: items.length,
    staleCount: staleItems.length,
    returnedCount: returnedItems.length,
    redCount: redItems.length,
    amberCount: items.filter((item) => item.severity === "amber").length,
    byRegion,
    items,
    staleItems,
    returnedItems,
    reviewPressure: [...returnedItems, ...staleItems]
      .filter((item, index, allItems) => allItems.findIndex((match) => match.id === item.id) === index)
      .slice(0, 20)
  };
}

function buildManagerFollowThroughDigests(entityLinks: ReturnType<typeof buildEntityLinks>) {
  const accountableItems = entityLinks.filter((item) => {
    const status = String(item.status || "");
    return item.severity !== "blue" ||
      item.isOverdue ||
      item.isDueSoon ||
      item.staleHours >= 24 ||
      item.escalationLevel !== "none" ||
      ["returned_to_manager", "blocked", "escalated", "reopened"].includes(status);
  });

  const digests = accountableItems.reduce<Record<string, {
    owner: string;
    region: string;
    totalOpen: number;
    red: number;
    overdue: number;
    dueSoon: number;
    carryover: number;
    blocked: number;
    submittedForReview: number;
    craigEscalation: number;
    topItems: typeof accountableItems;
  }>>((lookup, item) => {
    const owner = item.owner || `${item.region || "National"} Manager`;
    const current = lookup[owner] || {
      owner,
      region: item.ownerRegion || item.region || "National",
      totalOpen: 0,
      red: 0,
      overdue: 0,
      dueSoon: 0,
      carryover: 0,
      blocked: 0,
      submittedForReview: 0,
      craigEscalation: 0,
      topItems: []
    };
    const carryover = item.isOverdue || item.staleHours >= 24 || ["returned_to_manager", "blocked", "escalated", "reopened"].includes(String(item.status || ""));
    lookup[owner] = {
      ...current,
      totalOpen: current.totalOpen + 1,
      red: current.red + (item.severity === "red" ? 1 : 0),
      overdue: current.overdue + (item.isOverdue ? 1 : 0),
      dueSoon: current.dueSoon + (item.isDueSoon ? 1 : 0),
      carryover: current.carryover + (carryover ? 1 : 0),
      blocked: current.blocked + (String(item.status || "") === "blocked" ? 1 : 0),
      submittedForReview: current.submittedForReview + (String(item.status || "") === "submitted_for_review" ? 1 : 0),
      craigEscalation: current.craigEscalation + (item.escalationLevel === "craig" ? 1 : 0),
      topItems: [...current.topItems, item]
        .sort((a, b) => {
          const score = (entry: typeof item) =>
            (entry.escalationLevel === "craig" ? 100 : 0) +
            (entry.severity === "red" ? 60 : entry.severity === "amber" ? 25 : 0) +
            (entry.isOverdue ? 40 : 0) +
            (entry.staleHours >= 24 ? 15 : 0);
          return score(b) - score(a);
        })
        .slice(0, 3)
    };
    return lookup;
  }, {});

  return Object.values(digests)
    .map((digest) => {
      const escalationLevel = digest.craigEscalation ? "craig" : digest.overdue || digest.red ? "national" : digest.carryover || digest.dueSoon ? "watch" : "none";
      const recommendedAction = digest.craigEscalation
        ? `Review ${digest.owner}'s Craig escalation candidate before the next operating check.`
        : digest.blocked
          ? `Clear blockers with ${digest.owner} before the next operating check.`
        : digest.overdue
          ? `Ask ${digest.owner} for close-out or blocker detail on ${digest.overdue} overdue item${digest.overdue === 1 ? "" : "s"}.`
          : digest.submittedForReview
            ? `Review ${digest.submittedForReview} close-out item${digest.submittedForReview === 1 ? "" : "s"} submitted by ${digest.owner}.`
          : digest.carryover
            ? `Chase ${digest.owner} to update carryover work before it becomes overdue.`
            : `Keep ${digest.owner}'s queue visible in the next rhythm brief.`;

      return {
        ...digest,
        escalationLevel,
        recommendedAction,
        nextCheck: digest.craigEscalation || digest.overdue ? "now" : digest.carryover ? "today" : "next_brief"
      };
    })
    .sort((a, b) => b.craigEscalation - a.craigEscalation || b.blocked - a.blocked || b.overdue - a.overdue || b.red - a.red || b.submittedForReview - a.submittedForReview || b.carryover - a.carryover || b.totalOpen - a.totalOpen)
    .slice(0, 8);
}

function includesAny(value: string, terms: string[]) {
  const text = value.toLowerCase();
  return terms.some((term) => text.includes(term));
}

function buildCraigEscalationPolicy(entityLinks: ReturnType<typeof buildEntityLinks>) {
  const relevantItems = entityLinks.filter((item) => item.severity === "red" || item.isOverdue || item.escalationLevel === "craig");
  const candidates = relevantItems.map((item) => {
    const evidence = [
      item.title,
      item.source,
      item.category,
      item.issueType,
      item.entity?.client,
      item.entity?.site,
      item.entity?.vehicle,
      String(item.status || "")
    ].filter(Boolean).join(" ");
    const safetyOrCompliance = includesAny(evidence, ["safety", "compliance", "injury", "incident", "first aid", "audit", "defect", "unsafe", "stop use"]);
    const clientCritical = includesAny(evidence, ["client", "complaint", "national account", "key account", "major complaint", "site failure"]);
    const jobFailure = includesAny(evidence, ["job failure", "missed job", "jobsheet", "no crew", "uncovered", "not inducted", "roster gap"]);
    const material = safetyOrCompliance || clientCritical || jobFailure;
    const callCraig = item.escalationLevel === "craig" && material && (item.severity === "red" || item.isOverdue);
    const messageCraig = callCraig || (item.severity === "red" && material) || (item.isOverdue && material);
    const reason = callCraig
      ? "Material red/overdue safety, compliance, client or job-failure risk."
      : messageCraig
        ? "Material exception suitable for Craig notification, not an automatic phone call."
        : "Keep with manager or National unless it repeats, worsens or blocks work.";

    return {
      id: item.id,
      title: item.title,
      region: item.region,
      owner: item.owner,
      severity: item.severity,
      status: item.status,
      href: item.href,
      dueAt: item.dueAt,
      escalationLevel: item.escalationLevel,
      callCraig,
      messageCraig,
      nationalOnly: !messageCraig,
      reason,
      triggers: {
        safetyOrCompliance,
        clientCritical,
        jobFailure,
        overdue: item.isOverdue,
        red: item.severity === "red"
      }
    };
  });

  return {
    purpose: "Protect Craig's attention by separating phone-call exceptions from manager/national follow-up work.",
    rules: {
      callCraig: "Only call Craig for red or overdue material safety, compliance, client-critical or job-failure risk.",
      messageCraig: "Message Craig for material red/overdue risk that needs awareness but not an immediate call.",
      nationalOnly: "All other red/overdue work stays with the manager and National queue until repeated, blocked or worsened."
    },
    callCandidates: candidates.filter((item) => item.callCraig),
    messageCandidates: candidates.filter((item) => item.messageCraig && !item.callCraig),
    nationalOnlyCandidates: candidates.filter((item) => item.nationalOnly),
    suppressedCount: candidates.filter((item) => item.nationalOnly).length
  };
}

function buildStaffReadiness(staff: Awaited<ReturnType<typeof readOdinStaffEntities>>["staff"]) {
  const regionCounts = staff.reduce<Record<string, number>>((lookup, person) => {
    person.regions.forEach((region) => {
      lookup[region] = (lookup[region] || 0) + 1;
    });
    return lookup;
  }, {});
  const statusCounts = staff.reduce<Record<string, number>>((lookup, person) => {
    lookup[person.status] = (lookup[person.status] || 0) + 1;
    return lookup;
  }, { active: 0, watch: 0, inactive: 0 });
  const availableWindows = staff.reduce((total, person) => total + person.availability.availableWindows, 0);
  const totalWindows = staff.reduce((total, person) => total + person.availability.totalWindows, 0);
  const inductionRecords = staff.flatMap((person) => person.inductions.records);
  const inductionStatusCounts = inductionRecords.reduce<Record<string, number>>((lookup, record) => {
    const status = record.status || "Unknown";
    lookup[status] = (lookup[status] || 0) + 1;
    return lookup;
  }, {});
  const staffWithNoAvailability = staff
    .filter((person) => person.status !== "inactive" && person.availability.totalWindows > 0 && person.availability.availableWindows === 0)
    .map((person) => ({ id: person.id, name: person.name, regions: person.regions }));
  const staffWithNoInductions = staff
    .filter((person) => person.status !== "inactive" && !person.inductions.eligibleSites.length)
    .map((person) => ({ id: person.id, name: person.name, regions: person.regions }));

  return {
    activeStaff: statusCounts.active || 0,
    watchStaff: statusCounts.watch || 0,
    inactiveStaff: statusCounts.inactive || 0,
    regionCounts,
    availabilityWindows: {
      available: availableWindows,
      total: totalWindows,
      percentage: totalWindows ? Math.round((availableWindows / totalWindows) * 100) : null
    },
    inductionStatusCounts,
    staffWithNoAvailability,
    staffWithNoInductions
  };
}

async function readRows(input: {
  table: string;
  select: string;
  orderBy?: string;
  openStatusColumn?: string;
  openStatuses?: string[];
  equals?: Record<string, string | number | boolean>;
  excludeStatuses?: { column: string; statuses: string[] };
  limit?: number;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { rows: [], error: "Supabase server key is not configured." };

  let query = supabase
    .from(input.table)
    .select(input.select)
    .order(input.orderBy || "created_at", { ascending: false })
    .limit(input.limit || snapshotLimit);

  if (input.openStatusColumn && input.openStatuses?.length) query = query.in(input.openStatusColumn, input.openStatuses);
  Object.entries(input.equals || {}).forEach(([column, value]) => {
    query = query.eq(column, value);
  });
  if (input.excludeStatuses) query = query.not(input.excludeStatuses.column, "in", `(${input.excludeStatuses.statuses.join(",")})`);

  const { data, error } = await query;
  return {
    rows: (data || []) as unknown as SnapshotRow[],
    error: error?.message || null
  };
}

async function readCalendarJobs(generatedAt: Date) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { rows: [], error: "Supabase server key is not configured." };

  const startDate = dateOnly(generatedAt);
  const endDate = dateOnly(addDays(generatedAt, 7));
  const { data, error } = await supabase
    .from("calendar_jobs")
    .select("id,job_date,job_time,location,site,crew,job_title,status,notes,severity,updated_at")
    .gte("job_date", startDate)
    .lte("job_date", endDate)
    .order("job_date", { ascending: true })
    .order("job_time", { ascending: true })
    .limit(snapshotLimit);

  return {
    rows: (data || []) as unknown as SnapshotRow[],
    error: error?.message || null
  };
}

async function readRecentCompleted() {
  const [closedActions, completedCompliance, completedTodos, deliveredStock] = await Promise.all([
    readRows({
      table: "action_items",
      select: "id,title,status,closed_at,updated_at,region:regions(name)",
      openStatusColumn: "status",
      openStatuses: ["closed"],
      orderBy: "updated_at",
      limit: 20
    }),
    readRows({
      table: "compliance_items",
      select: "id,title,status,updated_at,region:regions(name)",
      openStatusColumn: "status",
      openStatuses: ["complete"],
      orderBy: "updated_at",
      limit: 20
    }),
    readRows({
      table: "todo_items",
      select: "id,title,is_done,owner_scope,updated_at",
      equals: { is_done: true },
      orderBy: "updated_at",
      limit: 20
    }),
    readRows({
      table: "stock_orders",
      select: "id,status,updated_at,region:regions(name),item:stock_order_items(item_name)",
      openStatusColumn: "status",
      openStatuses: ["delivered", "cancelled"],
      orderBy: "updated_at",
      limit: 20
    })
  ]);

  const rows: SnapshotRow[] = [
    ...closedActions.rows.map((row) => ({ ...row, entityType: "action_item" })),
    ...completedCompliance.rows.map((row) => ({ ...row, entityType: "compliance_item" })),
    ...completedTodos.rows.map((row) => ({ ...row, entityType: "todo_item" })),
    ...deliveredStock.rows.map((row) => ({ ...row, entityType: "stock_order" }))
  ];

  return {
    rows: rows.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 30),
    error: [closedActions.error, completedCompliance.error, completedTodos.error, deliveredStock.error].filter(Boolean).join("; ") || null
  };
}

async function readManagerContacts() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { rows: [], error: "Supabase server key is not configured." };

  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,email,access_level,is_active,contact_mobile,contact_whatsapp,profile_regions(region:regions(name))")
    .in("access_level", ["admin", "manager", "director", "national"])
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) return { rows: [], error: error.message };

  const rows = ((data || []) as SnapshotRow[]).map((profile) => ({
    id: profile.id,
    name: profile.display_name,
    email: profile.email,
    role: profile.access_level,
    mobile: profile.contact_mobile || "",
    whatsapp: profile.contact_whatsapp || profile.contact_mobile || "",
    regions: Array.isArray(profile.profile_regions)
      ? profile.profile_regions.map((item) => firstRelated((item as SnapshotRow).region)?.name).filter(Boolean)
      : []
  }));

  return { rows, error: null };
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const generatedAt = new Date();
  const [
    actionItems,
    nationalRequests,
    stockOrders,
    complianceItems,
    equipmentAssets,
    productivitySites,
    todoItems,
    odinItems,
    calendarJobs,
    recentCompleted,
    staffResult,
    rosterGaps,
    operationSites,
    siteSchedules,
    managerContacts
  ] = await Promise.all([
    readRows({
      table: "action_items",
      select: "id,title,detail,source_page,directive_type,priority,status,due_at,created_at,updated_at,region:regions(name)",
      excludeStatuses: { column: "status", statuses: ["closed"] }
    }),
    readRows({
      table: "national_requests",
      select: "id,request_type,title,detail,status,source_action_id,manager_response,evidence,source_page,directive_type,created_at,updated_at,region:regions(name)",
      openStatusColumn: "status",
      openStatuses: activeNationalRequestStatuses
    }),
    readRows({
      table: "stock_orders",
      select: "id,quantity,urgency,note,status,national_update,tracking_number,created_at,updated_at,region:regions(name),item:stock_order_items(item_name)",
      openStatusColumn: "status",
      openStatuses: activeStockStatuses
    }),
    readRows({
      table: "compliance_items",
      select: "id,title,detail,status,due_at,linked_action_id,created_at,updated_at,region:regions(name)",
      excludeStatuses: { column: "status", statuses: ["complete", "closed"] }
    }),
    readRows({
      table: "equipment_assets",
      select: "id,asset_name,asset_type,current_status,latest_odometer,latest_hours,next_service_due,service_note,latest_reading_at,linked_action_id,updated_at,region:regions(name)",
      orderBy: "updated_at",
      openStatusColumn: "current_status",
      openStatuses: activeEquipmentStatuses
    }),
    readRows({
      table: "productivity_sites",
      select: "id,site_name,productivity_score,latest_note,linked_action_id,created_at,updated_at,region:regions(name)"
    }),
    readRows({
      table: "todo_items",
      select: "id,title,is_done,is_important,shared_with,owner_role,owner_scope,created_at,updated_at",
      equals: { is_done: false }
    }),
    readRows({
      table: "odin_items",
      select: "id,item_type,title,summary,region,severity,confidence,status,approval_required,due_at,created_at,updated_at",
      openStatusColumn: "status",
      openStatuses: activeOdinStatuses
    }),
    readCalendarJobs(generatedAt),
    readRecentCompleted(),
    readOdinStaffEntities({ includeProtected: false }),
    buildOdinRosterGaps(),
    readRows({
      table: "operation_sites",
      select: "id,client_name,site_name,address,required_induction,required_crew_count,status,updated_at,region:regions(name)",
      orderBy: "updated_at",
      limit: 200
    }),
    readRows({
      table: "site_schedules",
      select: "id,schedule_name,start_date,end_date,job_time,recurrence,recurrence_interval_weeks,required_crew_count,job_title,status,last_generated_until,updated_at,region:regions(name),site:operation_sites(client_name,site_name)",
      orderBy: "updated_at",
      limit: 200
    }),
    readManagerContacts()
  ]);

  const sections = {
    actionItems,
    nationalRequests,
    stockOrders,
    complianceItems,
    equipmentAssets,
    productivitySites,
    todoItems,
    odinItems,
    calendarJobs,
    recentCompleted,
    operationSites,
    siteSchedules
  };
  const entityLinks = buildEntityLinks(sections, generatedAt);
  const staffReadiness = buildStaffReadiness(staffResult.staff);
  const overdueItems = entityLinks.filter((item) => item.isOverdue);
  const dueSoonItems = entityLinks.filter((item) => item.isDueSoon);
  const redItems = entityLinks.filter((item) => item.severity === "red");
  const duplicateIssueGroups = duplicateGroups(entityLinks);
  const actionClosure = actionClosureSummary(entityLinks);
  const nationalReview = buildNationalReviewSummary(nationalRequests.rows, generatedAt);
  const managerFollowThrough = buildManagerFollowThroughDigests(entityLinks);
  const craigEscalationPolicy = buildCraigEscalationPolicy(entityLinks);

  return NextResponse.json({
    connected: true,
    generatedAt: generatedAt.toISOString(),
    actor: permission.kind,
    mode: "operator_snapshot",
    operatingModel: {
      purpose: "Give Odin a single business snapshot so it can detect risk, route work to the correct TOC destination, and reduce manager drift.",
      alertRules: {
        red: "Create/route work immediately. Message Craig only for material red risk. Call Craig only when craigEscalationPolicy.callCandidates says callCraig=true.",
        amber: "Manager Action Centre or relevant page. Include in daily summary. Escalate only if overdue, repeated or blocked.",
        blue: "Dashboard/memory only. No interruption.",
        craigProtection: "Craig should not be interrupted for routine manager follow-up, duplicates, or non-material red work unless the policy marks it as a call/message candidate."
      },
      duplicatePrevention: "Prefer dedupeKey over title matching: region + entity type + source/category + title/entity + due date.",
      managerAccountability: "Use owner region, due date, status, last update and returned/submitted workflow to chase manager follow-through."
    },
    instructions: {
      actionWriteEndpoint: "/api/odin/actions",
      todoReminderEndpoint: "/api/odin/todos",
      complianceWriteEndpoint: "/api/odin/compliance",
      equipmentWriteEndpoint: "/api/odin/equipment",
      stockOrderWriteEndpoint: "/api/odin/stock-orders",
      jobsEndpoint: "/api/odin/jobs",
      rosterEndpoint: "/api/odin/roster",
      staffEndpoint: "/api/odin/staff",
      rosterGapEndpoint: "/api/odin/roster-gaps",
      notesWriteEndpoint: "/api/odin/notes",
      entityContextEndpoint: "/api/odin/context/:entityType/:id",
      recommendationWriteEndpoint: "/api/odin/items",
      allowedWriteActions: ["create", "update", "complete", "close", "delete", "delete_duplicates", "add_note", "escalate", "de_escalate"],
      routeByDestination: {
        actions: "/api/odin/actions",
        todos: "/api/odin/todos",
        compliance: "/api/odin/compliance",
        equipment: "/api/odin/equipment",
        stock_orders: "/api/odin/stock-orders",
        jobs: "/api/odin/jobs",
        roster: "/api/odin/roster",
        roster_gaps: "/api/odin/roster-gaps",
        notes: "/api/odin/notes"
      },
      actionCreationApprovalRequired: false,
      note: "Use the specific Odin endpoint for the destination. Non-create lifecycle operations require id/ids. Keep all admin user/password/role changes prohibited.",
      prohibitedActions: ["send_external_message_without_rule", "change_user", "change_password", "change_role", "admin_settings"]
    },
    managerContacts: {
      purpose: "Protected manager/admin/director contact mapping for Odin escalation. Odin may use these only for approved escalation rules, never for user/password/admin changes.",
      error: managerContacts.error,
      contacts: managerContacts.rows
    },
    summary: {
      totalOpenWork: entityLinks.length,
      openBySeverity: countBySeverity(entityLinks),
      openByRegion: countByRegion(entityLinks),
      openByOwner: countByOwner(entityLinks),
      openByEscalation: countByEscalation(entityLinks),
      overdueCount: overdueItems.length,
      dueSoonCount: dueSoonItems.length,
      redCount: redItems.length,
      duplicateGroupCount: duplicateIssueGroups.length,
      calendarJobsNext7Days: calendarJobs.rows.length,
      staffEntities: staffResult.staff.length,
      rosterGapCount: rosterGaps.gapCount,
      operationSites: operationSites.rows.length,
      siteSchedules: siteSchedules.rows.length,
      managerContacts: managerContacts.rows.length,
      recentCompletedCount: recentCompleted.rows.length,
      actionClosure,
      nationalReview,
      managerFollowThrough,
      craigEscalationPolicy,
      dataGaps: {
        staffPhoneNumbers: staffResult.source === "database" ? "protected_staff_profiles" : "staff_profiles_table_pending",
        liveRoster: siteSchedules.rows.length ? "site_schedules_and_calendar_jobs" : "calendar_jobs_only",
        rosterGapDetection: rosterGaps.connected ? "active" : rosterGaps.errors.join("; ") || "not_loaded",
        jobsheetEvidence: "not_loaded",
        clientComplaintFeed: "not_loaded",
        photoChecklistFeed: "not_loaded"
      }
    },
    focusQueues: {
      redItems,
      overdueItems,
      dueSoonItems,
      duplicateIssueGroups,
      tomorrowJobs: calendarJobs.rows.filter((row) => row.job_date === dateOnly(addDays(generatedAt, 1))),
      rosterGaps: rosterGaps.gaps,
      ownerQueue: entityLinks.filter((item) => item.escalationLevel !== "none"),
      actionCarryover: actionClosure.carryoverItems,
      nationalReview,
      managerFollowThrough,
      craigEscalationPolicy,
      recentlyCompleted: recentCompleted.rows
    },
    staffRoster: {
      staffSource: staffResult.source,
      staffConnected: staffResult.connected,
      staffError: staffResult.error,
      staffCount: staffResult.staff.length,
      staffReadiness,
      protectedFieldsInSnapshot: false,
      sampleStaff: staffResult.staff.slice(0, 20).map((staff) => ({
        id: staff.id,
        name: staff.name,
        regions: staff.regions,
        role: staff.role,
        status: staff.status,
        skills: staff.skills,
        availableWindows: staff.availability.availableWindows,
        inductionEligibleSites: staff.inductions.eligibleSites
      })),
      rosterGaps
    },
    operationsMasterData: {
      purpose: "Customer/site source of truth and recurring schedule control for calendar and Odin roster reasoning.",
      sites: operationSites.rows,
      schedules: siteSchedules.rows,
      nextStep: "Use Region Setup for customer/site schedules, or Admin Settings > Operations Master Data for national configuration."
    },
    entityLinks,
    sections
  });
}
