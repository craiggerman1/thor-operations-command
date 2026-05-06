import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";

type RegionRow = {
  id: string;
  name: string;
  is_active?: boolean;
};

function normaliseTargetRegions(value: unknown) {
  if (Array.isArray(value)) {
    const regions = value.map((region) => String(region).trim()).filter(Boolean);
    return regions.length ? regions : ["National"];
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((region) => region.trim()).filter(Boolean);
  }

  return ["National"];
}

function normaliseDirective(value: unknown): "National Ops Directive" | "Scheduled Directive" | "To Do" {
  if (value === "National Ops Directive" || value === "Scheduled Directive" || value === "To Do") return value;
  return "National Ops Directive";
}

function normalisePriority(value: unknown): "urgent" | "high" | "normal" | "low" {
  if (value === "urgent" || value === "high" || value === "normal" || value === "low") return value;
  return "high";
}

function normaliseSourcePage(value: unknown) {
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
    if (targetName === "National") return { id: null, name: "National" };
    return regions.find((region) => region.name.toLowerCase() === targetName.toLowerCase()) || null;
  }).filter(Boolean) as Array<{ id: string | null; name: string }>;
}

function actionDueDate(value: unknown) {
  if (!value) return null;
  const date = String(value);
  const parsed = date.includes("T") ? new Date(date) : new Date(`${date}T17:00:00+10:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));
  const title = String(payload.title || "").trim();
  if (!title) return NextResponse.json({ error: "Action title is required." }, { status: 400 });

  const targetRegions = await getTargetRegions(normaliseTargetRegions(payload.targetRegions || payload.regions || payload.region));
  if (!targetRegions.length) return NextResponse.json({ error: "No valid target regions supplied." }, { status: 400 });

  const detail = String(payload.detail || payload.actionDetail || payload.recommendedAction || "Odin issued this Action Centre item for manager close-out.");
  const directiveType = normaliseDirective(payload.directiveType);
  const priority = normalisePriority(payload.priority);
  const sourcePage = normaliseSourcePage(payload.sourcePage);
  const dueAt = actionDueDate(payload.dueDate || payload.dueAt);

  const actionRows = targetRegions.map((region) => ({
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

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const createdActionIds = ((createdActions as Array<{ id: string }> | null) || []).map((row) => row.id);
  const odinItemPayload = {
    targetRegions: targetRegions.map((region) => region.name),
    directiveType,
    priority,
    sourcePage,
    dueDate: payload.dueDate || payload.dueAt || null,
    createdActionIds,
    directIssue: true
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

  if (odinError) return NextResponse.json({ error: odinError.message }, { status: 500 });

  await logTocAudit({
    actor: permission.kind === "toc" ? permission.user : undefined,
    action: "odin.action.direct_create",
    entityTable: "action_items",
    entityId: createdActionIds[0],
    scope: targetRegions.map((region) => region.name).join(", "),
    details: {
      title,
      targetRegions: targetRegions.map((region) => region.name),
      createdActionIds,
      odinItemId: odinItem.id,
      actorType: permission.kind
    }
  });

  return NextResponse.json({
    connected: true,
    createdActionIds,
    createdCount: createdActionIds.length,
    odinItemId: odinItem.id,
    targetRegions: targetRegions.map((region) => region.name)
  });
}
