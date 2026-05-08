import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { createOdinDirectActionItems } from "@/lib/odin-actions";
import { handleOdinTodoItems } from "@/lib/odin-todos";
import { buildOdinRosterGaps } from "@/lib/odin-roster-gaps";
import { getSupabaseAdminClient } from "@/lib/supabase";

type BriefType = "morning" | "midday" | "end_of_day" | "weekly";

const briefTypes: BriefType[] = ["morning", "midday", "end_of_day", "weekly"];
const activeActionStatuses = ["open", "acknowledged", "in_progress", "blocked", "submitted_for_review", "returned_to_manager", "reopened", "escalated"];

type BriefPriorityItem = {
  title?: string;
  region?: string;
  severity?: string;
  recommendedAction?: string;
  href?: string;
  dueAt?: string;
  dedupeKey?: string;
  entityType?: string;
  entityId?: string;
  destination?: string;
  item?: string;
  assetName?: string;
  assetType?: string;
  quantity?: number;
  urgency?: string;
  autoAction?: boolean;
  linkedActionIds?: string[];
  destinationIds?: string[];
  actionHref?: string;
  followThroughStatus?: "created" | "linked" | "failed" | "skipped";
  followThroughError?: string;
  routeConfidence?: number;
  routeReason?: string;
  routeExplicit?: boolean;
};

type BriefActionRow = {
  id: string;
  title: string;
  detail: string | null;
  source_page: string | null;
  directive_type: string | null;
  priority: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  region?: { name: string } | { name: string }[] | null;
};

type RoutingDecision = {
  destination: string;
  confidence: number;
  explicit: boolean;
  reason: string;
  ambiguous: boolean;
};

type ExistingRouteRecord = {
  id: string;
  href: string;
  actionIds: string[];
};

function dateOnly(date = new Date(), timeZone = "Australia/Brisbane") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((output, part) => {
    output[part.type] = part.value;
    return output;
  }, {} as Record<string, string>);

  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  return `${year}-${month}-${day}`;
}

function cleanDateOnly(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : dateOnly();
}

function cleanBriefType(value: unknown): BriefType {
  return briefTypes.includes(value as BriefType) ? value as BriefType : "morning";
}

function briefTypeLabel(type: BriefType) {
  if (type === "morning") return "Morning Brief";
  if (type === "midday") return "Midday Check";
  if (type === "end_of_day") return "End-of-Day Closeout";
  return "Weekly Ops Review";
}

function severityFromCounts(redCount: number, amberCount: number) {
  if (redCount > 0) return "red";
  if (amberCount > 0) return "amber";
  return "blue";
}

async function countRows(input: { table: string; statuses?: string[]; statusColumn?: string }) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return 0;

  let query = supabase
    .from(input.table)
    .select("id", { count: "exact", head: true });

  if (input.statuses?.length) query = query.in(input.statusColumn || "status", input.statuses);
  const { count } = await query;
  return count || 0;
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hoursSince(value: string | null | undefined, now = new Date()) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3600000));
}

function isPastDue(value: string | null, now = new Date()) {
  if (!value) return false;
  const dueDate = new Date(value);
  return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < now.getTime();
}

function actionRegion(row: BriefActionRow) {
  return firstRelated(row.region)?.name || "National";
}

function actionSeverity(row: BriefActionRow) {
  const priority = String(row.priority || "").toLowerCase();
  if (row.directive_type === "National Ops Directive" || priority === "urgent" || priority === "high") return "red";
  if (row.directive_type === "Scheduled Directive" || priority === "normal") return "amber";
  return "blue";
}

function actionEscalationLevel(row: BriefActionRow, now = new Date()) {
  const overdue = isPastDue(row.due_at, now);
  const staleHours = hoursSince(row.updated_at || row.created_at, now);
  const urgent = row.directive_type === "National Ops Directive" || row.priority === "urgent";
  if ((overdue && urgent) || (row.status === "blocked" && urgent)) return "craig";
  if (overdue || ["returned_to_manager", "blocked", "escalated"].includes(row.status) || staleHours >= 48) return "national";
  if (staleHours >= 24 || ["submitted_for_review", "in_progress", "reopened"].includes(row.status)) return "watch";
  return "none";
}

function actionDedupeGroup(row: BriefActionRow) {
  return `${actionRegion(row)}:${row.source_page || "action"}:${String(row.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

async function readActionClosureContext(region: string, now = new Date()) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      actionRows: [] as BriefActionRow[],
      overdueActions: [] as BriefActionRow[],
      staleActions: [] as BriefActionRow[],
      carryoverActions: [] as BriefActionRow[],
      craigEscalationCandidates: [] as BriefActionRow[],
      repeatedIssueGroups: [] as { key: string; count: number; title: string; region: string }[],
      managerPressure: [] as { region: string; total: number; overdue: number; stale: number; carryover: number; craig: number }[]
    };
  }

  const { data } = await supabase
    .from("action_items")
    .select("id,title,detail,source_page,directive_type,priority,status,due_at,created_at,updated_at,region:regions(name)")
    .in("status", activeActionStatuses)
    .order("created_at", { ascending: false })
    .limit(120);

  const allRows = ((data || []) as BriefActionRow[])
    .filter((row) => region === "National" || actionRegion(row) === region);
  const overdueActions = allRows.filter((row) => isPastDue(row.due_at, now));
  const staleActions = allRows.filter((row) => hoursSince(row.updated_at || row.created_at, now) >= 24);
  const carryoverActions = allRows.filter((row) => isPastDue(row.due_at, now) || hoursSince(row.updated_at || row.created_at, now) >= 24 || ["returned_to_manager", "blocked", "escalated", "reopened"].includes(row.status));
  const craigEscalationCandidates = allRows.filter((row) => actionEscalationLevel(row, now) === "craig");
  const managerPressureLookup = allRows.reduce<Record<string, { region: string; total: number; overdue: number; stale: number; carryover: number; craig: number }>>((lookup, row) => {
    const rowRegion = actionRegion(row);
    const current = lookup[rowRegion] || { region: rowRegion, total: 0, overdue: 0, stale: 0, carryover: 0, craig: 0 };
    const stale = hoursSince(row.updated_at || row.created_at, now) >= 24;
    const overdue = isPastDue(row.due_at, now);
    lookup[rowRegion] = {
      ...current,
      total: current.total + 1,
      overdue: current.overdue + (overdue ? 1 : 0),
      stale: current.stale + (stale ? 1 : 0),
      carryover: current.carryover + (overdue || stale || ["returned_to_manager", "blocked", "escalated", "reopened"].includes(row.status) ? 1 : 0),
      craig: current.craig + (actionEscalationLevel(row, now) === "craig" ? 1 : 0)
    };
    return lookup;
  }, {});
  const repeatedLookup = allRows.reduce<Record<string, { key: string; count: number; title: string; region: string }>>((lookup, row) => {
    const key = actionDedupeGroup(row);
    const current = lookup[key] || { key, count: 0, title: row.title, region: actionRegion(row) };
    lookup[key] = { ...current, count: current.count + 1 };
    return lookup;
  }, {});

  return {
    actionRows: allRows,
    overdueActions,
    staleActions,
    carryoverActions,
    craigEscalationCandidates,
    repeatedIssueGroups: Object.values(repeatedLookup).filter((group) => group.count > 1).sort((a, b) => b.count - a.count),
    managerPressure: Object.values(managerPressureLookup).sort((a, b) => b.craig - a.craig || b.overdue - a.overdue || b.carryover - a.carryover || b.total - a.total)
  };
}

function actionPriorityItem(row: BriefActionRow, reason: string): BriefPriorityItem {
  const staleHours = hoursSince(row.updated_at || row.created_at);
  const overdue = isPastDue(row.due_at);
  const severity = actionEscalationLevel(row) === "craig" || overdue ? "red" : staleHours >= 24 ? "amber" : actionSeverity(row);

  return {
    title: `Chase close-out: ${row.title}`,
    region: actionRegion(row),
    severity,
    recommendedAction: `${reason}. Manager must update or close the existing Action Centre item: ${row.title}.`,
    href: `/actions/${row.id}`,
    actionHref: `/actions/${row.id}`,
    dueAt: row.due_at || undefined,
    dedupeKey: `closure-chase:${row.id}`,
    entityType: "action_item",
    entityId: row.id,
    destination: "todos",
    autoAction: true,
    linkedActionIds: [row.id],
    followThroughStatus: "linked"
  };
}

async function buildGeneratedBrief(type: BriefType, region: string, briefDate = dateOnly(), generatedBy = "toc", source = "generated") {
  const [openActions, nationalRequests, stockOrders, complianceItems, rosterGaps, closureContext] = await Promise.all([
    countRows({ table: "action_items", statuses: activeActionStatuses }),
    countRows({ table: "national_requests", statuses: ["awaiting_review", "returned_to_manager", "pending"] }),
    countRows({ table: "stock_orders", statuses: ["submitted", "awaiting_review", "cancel_requested", "update_requested"] }),
    countRows({ table: "compliance_items", statuses: ["open", "in_progress", "blocked", "not_started"] }),
    buildOdinRosterGaps(),
    readActionClosureContext(region)
  ]);
  const openRosterGaps = rosterGaps.gaps.filter((gap) => !gap.alreadyActioned && (region === "National" || gap.region === region));
  const redRosterGaps = openRosterGaps.filter((gap) => gap.severity === "red").length;
  const redClosureCount = closureContext.craigEscalationCandidates.length + closureContext.overdueActions.length;
  const amberCount = openActions + nationalRequests + stockOrders + complianceItems + openRosterGaps.length + closureContext.staleActions.length + closureContext.carryoverActions.length;
  const severity = severityFromCounts(redRosterGaps + redClosureCount, amberCount);
  const typeLabel = briefTypeLabel(type);
  const priorityItems = [
    ...closureContext.craigEscalationCandidates.slice(0, 2).map((row) => actionPriorityItem(row, "Craig escalation candidate")),
    ...closureContext.overdueActions.filter((row) => !closureContext.craigEscalationCandidates.some((candidate) => candidate.id === row.id)).slice(0, 3).map((row) => actionPriorityItem(row, "Overdue action")),
    ...closureContext.staleActions.filter((row) => !closureContext.overdueActions.some((overdue) => overdue.id === row.id)).slice(0, 3).map((row) => actionPriorityItem(row, "Stale manager action")),
    ...openRosterGaps.slice(0, 4).map((gap) => ({
      title: gap.title,
      region: gap.region,
      severity: gap.severity,
      recommendedAction: gap.recommendedAction,
      href: gap.linkedActionHref || "/national-requests",
      dueAt: gap.dueAt,
      dedupeKey: gap.dedupeKey,
      entityType: gap.entityType,
      entityId: gap.entityId,
      destination: "actions",
      autoAction: true
    })),
    ...closureContext.repeatedIssueGroups.slice(0, 2).map((group) => ({
      title: `Repeated issue watch: ${group.title}`,
      region: group.region,
      severity: "amber",
      recommendedAction: `${group.count} matching open action items exist. Review pattern and close duplicates or consolidate ownership.`,
      href: "/actions",
      dedupeKey: `repeated-action:${group.key}`,
      entityType: "action_pattern",
      entityId: group.key,
      destination: "actions",
      autoAction: false
    })),
    ...(nationalRequests ? [{ title: "National requests awaiting review", region: "National", severity: "amber", recommendedAction: "Review National Requests queue.", href: "/national-requests", autoAction: false }] : []),
    ...(complianceItems ? [{ title: "Compliance items open", region: "National", severity: "amber", recommendedAction: "Review Compliance and linked Action Centre items.", href: "/compliance", autoAction: false }] : [])
  ].slice(0, 8);
  const topManagerPressure = closureContext.managerPressure[0];
  const closureSummary = `${closureContext.overdueActions.length} overdue, ${closureContext.staleActions.length} stale, ${closureContext.carryoverActions.length} carryover`;
  const pressureSummary = topManagerPressure ? ` Top pressure: ${topManagerPressure.region} with ${topManagerPressure.total} open.` : "";

  return {
    briefDate,
    briefType: type,
    region,
    title: `${typeLabel} - ${region}`,
    summary: `${typeLabel}: ${openActions} open action items (${closureSummary}), ${nationalRequests} national requests, ${stockOrders} stock orders, ${complianceItems} compliance items and ${openRosterGaps.length} roster gaps need visibility.${pressureSummary}`,
    severity,
    status: "current",
    priorityItems,
    metrics: {
      openActions,
      nationalRequests,
      stockOrders,
      complianceItems,
      rosterGaps: openRosterGaps.length,
      redRosterGaps,
      overdueActions: closureContext.overdueActions.length,
      staleActions: closureContext.staleActions.length,
      carryoverActions: closureContext.carryoverActions.length,
      repeatedIssueGroups: closureContext.repeatedIssueGroups.length,
      craigEscalationCandidates: closureContext.craigEscalationCandidates.length,
      managerPressure: closureContext.managerPressure
    },
    generatedBy,
    source
  };
}

async function createBriefFollowThroughActions(input: {
  request: Request;
  brief: {
    briefDate: string;
    briefType: BriefType;
    region: string;
    priorityItems: BriefPriorityItem[];
  };
  actorKind: "odin" | "toc";
  actor?: Parameters<typeof logTocAudit>[0]["actor"];
}) {
  const actionResults = [];
  const updatedPriorityItems = [];
  let failureCount = 0;

  for (const item of input.brief.priorityItems) {
    if (item.autoAction === false || !item.title) {
      updatedPriorityItems.push({ ...item, followThroughStatus: "skipped" });
      continue;
    }

    const route = normaliseBriefDestination(item);
    const destination = route.destination;
    if (route.ambiguous || route.confidence < 60) {
      const message = route.ambiguous
        ? `Routing ambiguous: ${route.reason}`
        : `Routing confidence too low: ${route.reason}`;
      failureCount += 1;
      actionResults.push({
        title: item.title,
        destination,
        createdActionIds: [],
        linkedActionIds: [],
        destinationIds: [],
        skippedDuplicateCount: 0,
        error: message
      });
      updatedPriorityItems.push({
        ...item,
        destination,
        routeConfidence: route.confidence,
        routeReason: route.reason,
        routeExplicit: route.explicit,
        href: item.href || destinationHref(destination),
        followThroughStatus: "failed",
        followThroughError: message
      });
      continue;
    }

    const payload = briefPriorityPayload(item, input.brief, destination);
    const dedupeKey = String(payload.dedupeKey || "");
    const existingRecord = await existingRecordForDedupeKey(destination, dedupeKey);
    if (existingRecord) {
      const linkedActionIds = existingRecord.actionIds;
      const destinationIds = [existingRecord.id];
      const actionHref = linkedActionIds[0] ? `/actions/${linkedActionIds[0]}` : existingRecord.href;
      actionResults.push({
        title: item.title,
        destination,
        createdActionIds: [],
        linkedActionIds,
        destinationIds,
        skippedDuplicateCount: 1
      });
      updatedPriorityItems.push({
        ...item,
        destination,
        routeConfidence: route.confidence,
        routeReason: route.reason,
        routeExplicit: route.explicit,
        href: actionHref,
        actionHref,
        linkedActionIds,
        destinationIds,
        actionBacked: Boolean(linkedActionIds.length),
        followThroughStatus: "linked"
      });
      continue;
    }

    let result: Record<string, unknown>;

    try {
      result = await createDestinationRecord(input.request, destination, payload, input.actorKind, input.actor);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Priority follow-through failed.";
      failureCount += 1;
      actionResults.push({
        title: item.title,
        destination,
        createdActionIds: [],
        linkedActionIds: [],
        destinationIds: [],
        skippedDuplicateCount: 0,
        error: message
      });
      updatedPriorityItems.push({
        ...item,
        destination,
        routeConfidence: route.confidence,
        routeReason: route.reason,
        routeExplicit: route.explicit,
        href: item.href || destinationHref(destination),
        followThroughStatus: "failed",
        followThroughError: message
      });
      continue;
    }

    const createdActionIds = arrayOfStrings(result.createdActionIds);
    const linkedActionIds = destinationResultActionIds(result);
    const destinationIds = destinationResultIds(result, destination);
    const skippedDuplicateCount = Number(result.skippedDuplicateCount || 0);
    const actionHref = linkedActionIds[0] ? `/actions/${linkedActionIds[0]}` : destinationHref(destination, destinationIds[0], item.href);
    const hasNewDestinationRecord = destinationIds.length > 0 && skippedDuplicateCount === 0;
    const followThroughStatus = createdActionIds.length || hasNewDestinationRecord ? "created" : linkedActionIds.length || destinationIds.length ? "linked" : "skipped";
    actionResults.push({
      title: item.title,
      destination,
      createdActionIds,
      linkedActionIds: arrayOfStrings(result.linkedActionIds),
      destinationIds,
      skippedDuplicateCount
    });
    updatedPriorityItems.push({
      ...item,
      destination,
      routeConfidence: route.confidence,
      routeReason: route.reason,
      routeExplicit: route.explicit,
      href: actionHref,
      actionHref,
      linkedActionIds,
      destinationIds,
      actionBacked: Boolean(linkedActionIds.length),
      followThroughStatus
    });
  }

  return {
    priorityItems: updatedPriorityItems,
    actionResults,
    createdCount: actionResults.reduce((total, result) => total + result.createdActionIds.length, 0),
    linkedCount: actionResults.reduce((total, result) => total + result.linkedActionIds.length, 0),
    createdRecordCount: actionResults.reduce((total, result) => total + (result.skippedDuplicateCount ? 0 : result.destinationIds.length), 0),
    linkedRecordCount: actionResults.reduce((total, result) => total + (result.skippedDuplicateCount ? result.destinationIds.length : 0), 0),
    failureCount
  };
}

function normaliseBriefDestination(item: BriefPriorityItem): RoutingDecision {
  const explicit = String(item.destination || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (["actions", "todos", "compliance", "equipment", "stock_orders", "jobs", "notes"].includes(explicit)) {
    return { destination: explicit, confidence: 100, explicit: true, reason: "Explicit priority destination supplied.", ambiguous: false };
  }

  const text = `${item.title || ""} ${item.recommendedAction || ""} ${item.entityType || ""}`.toLowerCase();
  const matches = [
    { destination: "compliance", pattern: /\b(compliance|safety|induction|first aid|audit)\b/, reason: "Compliance/safety language detected." },
    { destination: "equipment", pattern: /\b(equipment|vehicle|truck|ute|unit|pony|generator|honda|repair|service)\b/, reason: "Equipment/service language detected." },
    { destination: "stock_orders", pattern: /\b(stock|chemical|ppe|consumable|supply|order|glove|bottle|hose|battery)\b/, reason: "Stock/order language detected." },
    { destination: "todos", pattern: /\b(todo|to do|remind|reminder)\b/, reason: "Reminder/to-do language detected." },
    { destination: "jobs", pattern: /\b(job|jobsheet|photo|checklist|calendar|roster)\b/, reason: "Job/calendar language detected." }
  ].filter((candidate) => candidate.pattern.test(text));

  if (matches.length === 1) {
    return { destination: matches[0].destination, confidence: 74, explicit: false, reason: matches[0].reason, ambiguous: false };
  }

  if (matches.length > 1) {
    return {
      destination: "actions",
      confidence: 42,
      explicit: false,
      reason: `Matched multiple destinations: ${matches.map((item) => item.destination).join(", ")}.`,
      ambiguous: true
    };
  }

  return { destination: "actions", confidence: 62, explicit: false, reason: "No specific route detected; defaulted to Action Centre.", ambiguous: false };
}

function briefPriorityPayload(item: BriefPriorityItem, brief: { briefDate: string; briefType: BriefType; region: string }, destination: string) {
  const region = item.region || brief.region;
  const detail = item.recommendedAction || "Odin daily rhythm raised this priority for manager close-out.";
  const base = {
    action: "create",
    title: item.title,
    detail,
    summary: detail,
    region,
    targetRegions: [region],
    priority: item.severity === "red" ? "urgent" : "high",
    severity: item.severity || "amber",
    directiveType: item.severity === "red" ? "National Ops Directive" : "Scheduled Directive",
    sourcePage: sourcePageForDestination(destination),
    sourceType: "odin_daily_brief",
    issueType: "daily-brief-priority",
    category: "daily-rhythm",
    dueAt: item.dueAt,
    dueDate: item.dueAt,
    entityType: item.entityType || "daily_brief_priority",
    entityId: item.entityId || item.dedupeKey || item.title,
    dedupeKey: item.dedupeKey || [
      "daily-brief",
      brief.briefDate,
      brief.briefType,
      destination,
      region,
      item.entityType || "priority",
      item.entityId || item.title,
      item.dueAt || "no-due"
    ].join(":")
  };

  if (destination === "todos") return { ...base, itemType: "todo", text: item.title, important: item.severity !== "blue" };
  if (destination === "equipment") return { ...base, assetName: item.assetName || item.entityId || item.title, assetType: item.assetType || "Wash asset", status: item.severity === "red" ? "Repair / stop use" : "Watch", serviceNote: detail };
  if (destination === "stock_orders") return { ...base, item: item.item || item.title, itemName: item.item || item.title, quantity: item.quantity || 1, urgency: item.urgency || (item.severity === "red" ? "urgent" : "normal"), note: detail };
  if (destination === "jobs") return { ...base, job: item.title, jobDate: brief.briefDate, date: brief.briefDate, location: region, site: item.entityId || "Unassigned site", notes: detail };
  if (destination === "notes") return { ...base, note: detail, facts: { briefDate: brief.briefDate, briefType: brief.briefType, priorityItem: item } };
  return base;
}

async function existingRecordForDedupeKey(destination: string, dedupeKey: string): Promise<ExistingRouteRecord | null> {
  if (!dedupeKey) return null;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const sourceType = sourceTypeForDestination(destination);
  const { data: memoryRow } = await supabase
    .from("odin_memory")
    .select("source_id,last_response")
    .eq("source_type", sourceType)
    .contains("facts", { dedupeKey })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sourceId = typeof memoryRow?.source_id === "string" ? memoryRow.source_id : "";
  if (!sourceId) return null;

  const record = await readExistingDestinationRecord(destination, sourceId);
  if (!record) return null;

  const lastResponse = memoryRow?.last_response && typeof memoryRow.last_response === "object" ? memoryRow.last_response as Record<string, unknown> : {};
  const linkedActionId = typeof lastResponse.linkedActionId === "string" ? lastResponse.linkedActionId : "";
  return {
    id: sourceId,
    href: destinationHref(destination, sourceId),
    actionIds: linkedActionId ? [linkedActionId] : arrayOfStrings(record.linked_action_id)
  };
}

function sourceTypeForDestination(destination: string) {
  const map: Record<string, string> = {
    actions: "action_item",
    todos: "todo_item",
    compliance: "compliance_item",
    equipment: "equipment_asset",
    stock_orders: "stock_order",
    jobs: "calendar_job",
    notes: "odin_note"
  };
  return map[destination] || "action_item";
}

async function readExistingDestinationRecord(destination: string, sourceId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const config: Record<string, { table: string; select: string; active: (row: Record<string, unknown>) => boolean }> = {
    actions: { table: "action_items", select: "id,status", active: (row) => row.status !== "closed" },
    todos: { table: "todo_items", select: "id,is_done", active: (row) => row.is_done !== true },
    compliance: { table: "compliance_items", select: "id,status,linked_action_id", active: (row) => !["complete", "closed"].includes(String(row.status)) },
    equipment: { table: "equipment_assets", select: "id,current_status,linked_action_id", active: () => true },
    stock_orders: { table: "stock_orders", select: "id,status", active: (row) => !["delivered", "cancelled", "closed"].includes(String(row.status)) },
    jobs: { table: "calendar_jobs", select: "id,status", active: (row) => !["Completed", "Cancelled", "closed", "complete"].includes(String(row.status)) },
    notes: { table: "odin_memory", select: "id", active: () => true }
  };
  const route = config[destination];
  if (!route) return null;

  const { data } = await supabase
    .from(route.table)
    .select(route.select)
    .eq("id", sourceId)
    .maybeSingle();

  const row = data as Record<string, unknown> | null;
  return row && route.active(row) ? row : null;
}

function sourcePageForDestination(destination: string) {
  const map: Record<string, string> = {
    actions: "Action Centre",
    todos: "To Do",
    compliance: "Compliance",
    equipment: "Equipment Servicing",
    stock_orders: "Stock Orders",
    jobs: "Calendar",
    notes: "Odin"
  };
  return map[destination] || "Action Centre";
}

async function createDestinationRecord(
  request: Request,
  destination: string,
  payload: Record<string, unknown>,
  actorKind: "odin" | "toc",
  actor?: Parameters<typeof logTocAudit>[0]["actor"]
): Promise<Record<string, unknown>> {
  if (destination === "actions") {
    return await createOdinDirectActionItems({ payload, actorKind, actor }) as Record<string, unknown>;
  }
  if (destination === "todos") {
    return await handleOdinTodoItems({ payload, actorKind, actor }) as Record<string, unknown>;
  }

  const paths: Record<string, string> = {
    compliance: "/api/odin/compliance",
    equipment: "/api/odin/equipment",
    stock_orders: "/api/odin/stock-orders",
    jobs: "/api/odin/jobs",
    notes: "/api/odin/notes"
  };
  const path = paths[destination] || "/api/odin/actions";
  const origin = new URL(request.url).origin;
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-odin-api-key": process.env.ODIN_API_KEY || ""
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.connected === false) throw new Error(data.error || `Odin ${destination} follow-through failed.`);
  return data as Record<string, unknown>;
}

function destinationResultActionIds(result: Record<string, unknown>) {
  return [
    ...arrayOfStrings(result.createdActionIds),
    ...arrayOfStrings(result.linkedActionIds),
    ...arrayOfStrings(result.updatedActionIds)
  ];
}

function destinationResultIds(result: Record<string, unknown>, destination: string) {
  const keys: Record<string, string[]> = {
    actions: ["createdActionIds", "linkedActionIds"],
    todos: ["createdTodoIds", "linkedTodoIds"],
    compliance: ["createdComplianceIds", "linkedComplianceIds", "updatedComplianceIds"],
    equipment: ["createdAssetIds", "linkedAssetIds", "updatedAssetIds"],
    stock_orders: ["createdStockOrderIds", "linkedStockOrderIds", "updatedStockOrderIds"],
    jobs: ["createdJobIds", "linkedJobIds", "updatedJobIds"],
    notes: ["noteId", "noteIds"]
  };
  return (keys[destination] || []).flatMap((key) => arrayOfStrings(result[key]));
}

function arrayOfStrings(value: unknown) {
  return (Array.isArray(value) ? value : value ? [value] : []).map((item) => String(item)).filter(Boolean);
}

function destinationHref(destination: string, id?: string, fallback = "/actions") {
  if (destination === "actions" && id) return `/actions/${id}`;
  if (destination === "compliance") return "/compliance";
  if (destination === "equipment") return "/equipment-servicing";
  if (destination === "stock_orders") return "/stock-orders";
  if (destination === "todos") return "/todo";
  if (destination === "jobs") return "/calendar";
  if (destination === "notes") return "/home";
  return fallback || "/actions";
}

function mapBriefRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    briefDate: row.brief_date,
    briefType: row.brief_type,
    region: row.region,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    status: row.status,
    priorityItems: row.priority_items || [],
    metrics: row.metrics || {},
    generatedBy: row.generated_by,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const region = url.searchParams.get("region") || "National";
  const briefDate = cleanDateOnly(url.searchParams.get("date"));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 80));

  const { data, error } = await supabase
    .from("odin_daily_briefs")
    .select("*")
    .eq("region", region)
    .lte("brief_date", briefDate)
    .order("brief_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ connected: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    connected: true,
    region,
    briefDate,
    briefs: ((data || []) as Record<string, unknown>[]).map(mapBriefRow)
  });
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(payload.action || "upsert");
  const briefType = cleanBriefType(payload.briefType || payload.type);
  const region = String(payload.region || "National");
  const source = String(payload.source || (permission.kind === "odin" ? "odin" : "toc"));
  const generatedBy = permission.kind === "odin" ? "odin" : "toc";
  const briefData = action === "generate"
    ? await buildGeneratedBrief(briefType, region, cleanDateOnly(payload.briefDate || payload.date), generatedBy, source)
    : {
      briefDate: cleanDateOnly(payload.briefDate || payload.date),
      briefType,
      region,
      title: String(payload.title || `${briefTypeLabel(briefType)} - ${region}`),
      summary: String(payload.summary || "Odin operating brief created."),
      severity: String(payload.severity || "blue"),
      status: String(payload.status || "current"),
      priorityItems: Array.isArray(payload.priorityItems) ? payload.priorityItems : [],
      metrics: payload.metrics && typeof payload.metrics === "object" ? payload.metrics : {},
      generatedBy,
      source
    };

  const { data, error } = await supabase
    .from("odin_daily_briefs")
    .upsert({
      brief_date: briefData.briefDate,
      brief_type: briefData.briefType,
      region: briefData.region,
      title: briefData.title,
      summary: briefData.summary,
      severity: briefData.severity,
      status: briefData.status,
      priority_items: briefData.priorityItems,
      metrics: briefData.metrics,
      generated_by: briefData.generatedBy,
      source: briefData.source,
      updated_at: new Date().toISOString()
    }, { onConflict: "brief_date,brief_type,region" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ connected: false, error: error.message }, { status: 500 });

  let briefRow = data as Record<string, unknown>;
  let followThrough: Awaited<ReturnType<typeof createBriefFollowThroughActions>> | null = null;
  let followThroughError = "";
  const autoCreateActions = payload.autoCreateActions !== false;

  if (autoCreateActions && ["generate", "upsert", "create"].includes(action) && Array.isArray(briefData.priorityItems) && briefData.priorityItems.length) {
    try {
      followThrough = await createBriefFollowThroughActions({
        request,
        brief: {
          briefDate: briefData.briefDate,
          briefType: briefData.briefType,
          region: briefData.region,
          priorityItems: briefData.priorityItems as BriefPriorityItem[]
        },
        actorKind: permission.kind,
        actor: permission.kind === "toc" ? permission.user : undefined
      });

      const { data: updatedBrief, error: updateError } = await supabase
        .from("odin_daily_briefs")
        .update({
          priority_items: followThrough.priorityItems,
          metrics: {
            ...briefData.metrics,
            actionItemsCreated: followThrough.createdCount,
            actionItemsLinked: followThrough.linkedCount,
            followThroughRecordsCreated: followThrough.createdRecordCount,
            followThroughRecordsLinked: followThrough.linkedRecordCount,
            followThroughFailures: followThrough.failureCount
          },
          updated_at: new Date().toISOString()
        })
        .eq("id", data.id)
        .select("*")
        .single();

      if (updateError) throw updateError;
      briefRow = updatedBrief as Record<string, unknown>;
    } catch (error) {
      followThroughError = error instanceof Error ? error.message : "Brief follow-through action creation failed.";
    }
  }

  await logTocAudit({
    actor: permission.kind === "toc" ? permission.user : undefined,
    action: action === "generate" ? "odin.brief.generate" : "odin.brief.upsert",
    entityTable: "odin_daily_briefs",
    entityId: data.id,
    scope: briefData.region,
    details: {
      briefType: briefData.briefType,
      actorType: permission.kind,
      followThroughCreated: followThrough?.createdCount || 0,
      followThroughLinked: followThrough?.linkedCount || 0,
      followThroughRecordsCreated: followThrough?.createdRecordCount || 0,
      followThroughRecordsLinked: followThrough?.linkedRecordCount || 0,
      followThroughFailures: followThrough?.failureCount || 0,
      followThroughError: followThroughError || undefined
    }
  });

  return NextResponse.json({
    connected: true,
    action,
    brief: mapBriefRow(briefRow),
    followThrough,
    followThroughError: followThroughError || undefined
  });
}
