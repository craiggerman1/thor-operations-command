import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { TocAuthenticatedUser } from "@/lib/toc-auth";
import { buildOdinOperationalContext, saveOdinOperationalMemory } from "@/lib/odin-operational-context";

type RegionRow = {
  id: string;
  name: string;
  is_active?: boolean;
};

type OdinDirectActionInput = {
  payload: Record<string, unknown>;
  actorKind: "odin" | "toc";
  actor?: TocAuthenticatedUser;
};

export function normaliseOdinTargetRegions(value: unknown, fallback = "National") {
  function cleanRegionName(region: string) {
    const cleaned = region
      .replace(/\b(manager|managers|region|regions|area|areas|state|states|team|teams)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || region.trim();
  }

  if (Array.isArray(value)) {
    const regions = value.map((region) => cleanRegionName(String(region))).filter(Boolean);
    return regions.length ? regions : [fallback];
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((region) => cleanRegionName(region)).filter(Boolean);
  }

  return [fallback];
}

export function normaliseOdinDirective(value: unknown): "National Ops Directive" | "Scheduled Directive" | "To Do" {
  if (value === "National Ops Directive" || value === "Scheduled Directive" || value === "To Do") return value;
  return "National Ops Directive";
}

export function normaliseOdinPriority(value: unknown): "urgent" | "high" | "normal" | "low" {
  if (value === "urgent" || value === "high" || value === "normal" || value === "low") return value;
  return "high";
}

export function normaliseOdinSourcePage(value: unknown) {
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

export function normaliseOdinDueDate(value: unknown) {
  if (!value) return null;
  const date = String(value);
  const parsed = date.includes("T") ? new Date(date) : new Date(`${date}T17:00:00+10:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function existingOpenActionsByDedupeKey(dedupeKeys: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !dedupeKeys.length) return new Map<string, string>();

  const { data: memoryRows } = await supabase
    .from("odin_memory")
    .select("source_id,facts")
    .eq("source_type", "action_item");

  const matchingRows = ((memoryRows || []) as Array<{
    source_id?: string | null;
    facts?: { dedupeKey?: string } | null;
  }>).filter((row) => row.source_id && row.facts?.dedupeKey && dedupeKeys.includes(row.facts.dedupeKey));
  const actionIds = Array.from(new Set(matchingRows.map((row) => row.source_id).filter(Boolean) as string[]));
  if (!actionIds.length) return new Map();

  const { data: actionRows } = await supabase
    .from("action_items")
    .select("id,status")
    .in("id", actionIds);
  const openActionIds = new Set(((actionRows || []) as Array<{ id: string; status: string }>).filter((row) => row.status !== "closed").map((row) => row.id));
  const linked = new Map<string, string>();

  matchingRows.forEach((row) => {
    if (row.source_id && row.facts?.dedupeKey && openActionIds.has(row.source_id)) {
      linked.set(row.facts.dedupeKey, row.source_id);
    }
  });

  return linked;
}

async function existingOpenActionsBySignature(input: {
  title: string;
  detail: string;
  sourcePage: string;
  dueAt: string | null;
  targetRegions: Array<{ id: string | null; name: string }>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.targetRegions.length) return new Map<string, string>();

  const activeStatuses = ["open", "acknowledged", "in_progress", "blocked", "submitted_for_review", "returned_to_manager", "reopened", "escalated"];
  const linked = new Map<string, string>();

  await Promise.all(input.targetRegions.map(async (region) => {
    let query = supabase
      .from("action_items")
      .select("id,assigned_region_id,due_at,detail")
      .eq("title", input.title)
      .eq("source_page", input.sourcePage)
      .in("status", activeStatuses)
      .limit(1);

    query = region.id ? query.eq("assigned_region_id", region.id) : query.is("assigned_region_id", null);
    query = input.dueAt ? query.eq("due_at", input.dueAt) : query.is("due_at", null);

    const { data } = await query;
    const row = (data as Array<{ id: string }> | null)?.[0];
    if (row?.id) linked.set(region.name, row.id);
  }));

  return linked;
}

async function existingOpenActionsByTitleAndRegion(input: {
  title: string;
  targetRegions: Array<{ id: string | null; name: string }>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.targetRegions.length) return new Map<string, string>();

  const activeStatuses = ["open", "acknowledged", "in_progress", "blocked", "submitted_for_review", "returned_to_manager", "reopened", "escalated"];
  const linked = new Map<string, string>();

  await Promise.all(input.targetRegions.map(async (region) => {
    let query = supabase
      .from("action_items")
      .select("id,assigned_region_id")
      .eq("title", input.title)
      .in("status", activeStatuses)
      .order("created_at", { ascending: false })
      .limit(1);

    query = region.id ? query.eq("assigned_region_id", region.id) : query.is("assigned_region_id", null);

    const { data } = await query;
    const row = (data as Array<{ id: string }> | null)?.[0];
    if (row?.id) linked.set(region.name, row.id);
  }));

  return linked;
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
    if (targetName.toLowerCase() === "head office") return { id: null, name: "National" };
    if (targetName === "National") return { id: null, name: "National" };
    return regions.find((region) => region.name.toLowerCase() === targetName.toLowerCase()) || null;
  }).filter(Boolean) as Array<{ id: string | null; name: string }>;
}

export async function createOdinDirectActionItems(input: OdinDirectActionInput) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const payload = input.payload;
  const title = String(payload.title || "").trim();
  if (!title) throw new Error("Action title is required.");

  const targetRegions = await getTargetRegions(normaliseOdinTargetRegions(payload.targetRegions || payload.regions || payload.region));
  if (!targetRegions.length) throw new Error("No valid target regions supplied.");

  const detail = String(payload.detail || payload.actionDetail || payload.recommendedAction || "Odin issued this Action Centre item for manager close-out.");
  const directiveType = normaliseOdinDirective(payload.directiveType);
  const priority = normaliseOdinPriority(payload.priority);
  const sourcePage = normaliseOdinSourcePage(payload.sourcePage);
  const dueAt = normaliseOdinDueDate(payload.dueDate || payload.dueAt);
  const previewContexts = targetRegions.map((region) => ({
    region,
    context: buildOdinOperationalContext({
      payload,
      destination: "actions",
      region: region.name,
      title,
      sourcePage,
      severity: String(payload.severity || (priority === "urgent" ? "red" : "amber")),
      priority,
      dueAt
    })
  }));
  const existingActions = await existingOpenActionsByDedupeKey(previewContexts.map((item) => item.context.dedupeKey));
  const signatureMatches = await existingOpenActionsBySignature({ title, detail, sourcePage, dueAt, targetRegions });
  const titleRegionMatches = await existingOpenActionsByTitleAndRegion({ title, targetRegions });
  const actionTargets = previewContexts.filter((item) => !existingActions.has(item.context.dedupeKey) && !signatureMatches.has(item.region.name) && !titleRegionMatches.has(item.region.name));

  if (!actionTargets.length) {
    const linkedActionIds = Array.from(new Set([...Array.from(existingActions.values()), ...Array.from(signatureMatches.values()), ...Array.from(titleRegionMatches.values())]));
    return {
      createdActionIds: [],
      createdCount: 0,
      linkedActionIds,
      skippedDuplicateCount: previewContexts.length,
      targetRegions: targetRegions.map((region) => region.name)
    };
  }

  const actionRows = actionTargets.map(({ region }) => ({
    title,
    detail,
    source_page: sourcePage,
    directive_type: directiveType,
    priority,
    status: "open",
    assigned_region_id: region.id,
    due_at: dueAt
  }));

  const { data: createdActions, error: insertError } = await supabase
    .from("action_items")
    .insert(actionRows)
    .select("id");

  if (insertError) throw insertError;

  const createdActionIds = ((createdActions as Array<{ id: string }> | null) || []).map((row) => row.id);
  const operationalContexts = actionTargets.map(({ region, context }, index) => ({
    actionId: createdActionIds[index],
    region: region.name,
    ...context
  }));
  const skippedDuplicateActionIds = Array.from(new Set([...Array.from(existingActions.values()), ...Array.from(signatureMatches.values()), ...Array.from(titleRegionMatches.values())]));
  const odinItemPayload = {
    targetRegions: actionTargets.map(({ region }) => region.name),
    directiveType,
    priority,
    sourcePage,
    dueDate: payload.dueDate || payload.dueAt || null,
    createdActionIds,
    skippedDuplicateActionIds,
    directIssue: true,
    ownership: operationalContexts
  };

  const { data: odinItem, error: odinError } = await supabase
    .from("odin_items")
    .insert({
      item_type: "action_request",
      title,
      summary: String(payload.summary || "Odin directly issued Action Centre work after Craig/admin instruction."),
      region: "National",
      source_type: String(payload.sourceType || "odin_direct_action"),
      severity: String(payload.severity || "amber"),
      confidence: Math.max(0, Math.min(Number(payload.confidence) || 90, 100)),
      approval_required: false,
      status: "approved",
      noticed: String(payload.noticed || "Odin received direct instruction to issue manager action items."),
      why_it_matters: String(payload.whyItMatters || "The task needs manager ownership and close-out in TOC."),
      recommended_action: detail,
      assigned_to: "National",
      due_at: dueAt,
      created_by: "odin",
      payload: odinItemPayload
    })
    .select("id")
    .single();

  if (odinError) throw odinError;

  await logTocAudit({
    actor: input.actorKind === "toc" ? input.actor : undefined,
    action: "odin.action.direct_create",
    entityTable: "action_items",
    entityId: createdActionIds[0],
    scope: actionTargets.map(({ region }) => region.name).join(", "),
    details: {
      title,
      targetRegions: actionTargets.map(({ region }) => region.name),
      createdActionIds,
      skippedDuplicateActionIds,
      odinItemId: odinItem.id,
      ownership: operationalContexts,
      actorType: input.actorKind
    }
  });

  await Promise.all(operationalContexts.map((context) => context.actionId
    ? saveOdinOperationalMemory({
      context,
      sourceType: "action_item",
      sourceId: context.actionId,
      region: context.region,
      title,
      summary: detail,
      lastResponse: { createdBy: "odin", odinItemId: odinItem.id }
    })
    : Promise.resolve()
  ));

  return {
    createdActionIds,
    createdCount: createdActionIds.length,
    odinItemId: odinItem.id,
    linkedActionIds: skippedDuplicateActionIds,
    skippedDuplicateCount: previewContexts.length - actionTargets.length,
    skippedSignatureDuplicateActionIds: Array.from(signatureMatches.values()),
    skippedTitleRegionDuplicateActionIds: Array.from(titleRegionMatches.values()),
    targetRegions: targetRegions.map((region) => region.name)
  };
}
