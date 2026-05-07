import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { createOdinDirectActionItems } from "@/lib/odin-actions";
import { handleOdinTodoItems } from "@/lib/odin-todos";
import { buildOdinRosterGaps } from "@/lib/odin-roster-gaps";
import { getSupabaseAdminClient } from "@/lib/supabase";

type BriefType = "morning" | "midday" | "end_of_day" | "weekly";

const briefTypes: BriefType[] = ["morning", "midday", "end_of_day", "weekly"];

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

async function buildGeneratedBrief(type: BriefType, region: string, briefDate = dateOnly(), generatedBy = "toc", source = "generated") {
  const [openActions, nationalRequests, stockOrders, complianceItems, rosterGaps] = await Promise.all([
    countRows({ table: "action_items", statuses: ["open", "submitted_for_review", "returned_to_manager"] }),
    countRows({ table: "national_requests", statuses: ["awaiting_review", "returned_to_manager", "pending"] }),
    countRows({ table: "stock_orders", statuses: ["submitted", "awaiting_review", "cancel_requested", "update_requested"] }),
    countRows({ table: "compliance_items", statuses: ["open", "in_progress", "blocked", "not_started"] }),
    buildOdinRosterGaps()
  ]);
  const openRosterGaps = rosterGaps.gaps.filter((gap) => !gap.alreadyActioned && (region === "National" || gap.region === region));
  const redRosterGaps = openRosterGaps.filter((gap) => gap.severity === "red").length;
  const amberCount = openActions + nationalRequests + stockOrders + complianceItems + openRosterGaps.length;
  const severity = severityFromCounts(redRosterGaps, amberCount);
  const typeLabel = briefTypeLabel(type);
  const priorityItems = [
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
    ...(nationalRequests ? [{ title: "National requests awaiting review", region: "National", severity: "amber", recommendedAction: "Review National Requests queue.", href: "/national-requests", autoAction: false }] : []),
    ...(complianceItems ? [{ title: "Compliance items open", region: "National", severity: "amber", recommendedAction: "Review Compliance and linked Action Centre items.", href: "/compliance", autoAction: false }] : [])
  ].slice(0, 8);

  return {
    briefDate,
    briefType: type,
    region,
    title: `${typeLabel} - ${region}`,
    summary: `${typeLabel}: ${openActions} open action items, ${nationalRequests} national requests, ${stockOrders} stock orders, ${complianceItems} compliance items and ${openRosterGaps.length} roster gaps need visibility.`,
    severity,
    status: "current",
    priorityItems,
    metrics: {
      openActions,
      nationalRequests,
      stockOrders,
      complianceItems,
      rosterGaps: openRosterGaps.length,
      redRosterGaps
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

  for (const item of input.brief.priorityItems) {
    if (item.autoAction === false || !item.title) {
      updatedPriorityItems.push(item);
      continue;
    }

    const destination = normaliseBriefDestination(item);
    const payload = briefPriorityPayload(item, input.brief, destination);
    const result = await createDestinationRecord(input.request, destination, payload, input.actorKind, input.actor);
    const linkedActionIds = destinationResultActionIds(result);
    const destinationIds = destinationResultIds(result, destination);
    const actionHref = linkedActionIds[0] ? `/actions/${linkedActionIds[0]}` : destinationHref(destination, destinationIds[0], item.href);

    actionResults.push({
      title: item.title,
      destination,
      createdActionIds: arrayOfStrings(result.createdActionIds),
      linkedActionIds: arrayOfStrings(result.linkedActionIds),
      destinationIds,
      skippedDuplicateCount: Number(result.skippedDuplicateCount || 0)
    });
    updatedPriorityItems.push({
      ...item,
      destination,
      href: actionHref,
      actionHref,
      linkedActionIds,
      destinationIds,
      actionBacked: Boolean(linkedActionIds.length)
    });
  }

  return {
    priorityItems: updatedPriorityItems,
    actionResults,
    createdCount: actionResults.reduce((total, result) => total + result.createdActionIds.length, 0),
    linkedCount: actionResults.reduce((total, result) => total + result.linkedActionIds.length, 0)
  };
}

function normaliseBriefDestination(item: BriefPriorityItem) {
  const explicit = String(item.destination || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (["actions", "todos", "compliance", "equipment", "stock_orders", "jobs", "notes"].includes(explicit)) return explicit;

  const text = `${item.title || ""} ${item.recommendedAction || ""} ${item.entityType || ""}`.toLowerCase();
  if (/\b(compliance|safety|induction|first aid|audit)\b/.test(text)) return "compliance";
  if (/\b(equipment|vehicle|truck|ute|unit|pony|generator|honda|repair|service)\b/.test(text)) return "equipment";
  if (/\b(stock|chemical|ppe|consumable|supply|order|glove|bottle|hose|battery)\b/.test(text)) return "stock_orders";
  if (/\b(todo|to do|remind|reminder|checklist)\b/.test(text)) return "todos";
  if (/\b(job|jobsheet|photo|checklist|calendar|roster)\b/.test(text)) return "jobs";
  return "actions";
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
    dedupeKey: item.dedupeKey || `daily-brief:${brief.briefDate}:${brief.briefType}:${region}:${item.title}`
  };

  if (destination === "todos") return { ...base, itemType: "todo", text: item.title, important: item.severity !== "blue" };
  if (destination === "equipment") return { ...base, assetName: item.assetName || item.entityId || item.title, assetType: item.assetType || "Wash asset", status: item.severity === "red" ? "Repair / stop use" : "Watch", serviceNote: detail };
  if (destination === "stock_orders") return { ...base, item: item.item || item.title, itemName: item.item || item.title, quantity: item.quantity || 1, urgency: item.urgency || (item.severity === "red" ? "urgent" : "normal"), note: detail };
  if (destination === "jobs") return { ...base, job: item.title, jobDate: brief.briefDate, date: brief.briefDate, location: region, site: item.entityId || "Unassigned site", notes: detail };
  if (destination === "notes") return { ...base, note: detail, facts: { briefDate: brief.briefDate, briefType: brief.briefType, priorityItem: item } };
  return base;
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
    compliance: ["createdComplianceIds", "updatedComplianceIds"],
    equipment: ["createdAssetIds", "updatedAssetIds"],
    stock_orders: ["createdStockOrderIds", "updatedStockOrderIds"],
    jobs: ["createdJobIds", "updatedJobIds"],
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
            actionItemsLinked: followThrough.linkedCount
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
