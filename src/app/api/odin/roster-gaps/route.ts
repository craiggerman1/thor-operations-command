import { NextResponse } from "next/server";
import { createOdinDirectActionItems } from "@/lib/odin-actions";
import { logTocAudit } from "@/lib/audit";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { buildOdinRosterGaps } from "@/lib/odin-roster-gaps";
import { getSupabaseAdminClient } from "@/lib/supabase";

function actionDetailForGap(gap: Awaited<ReturnType<typeof buildOdinRosterGaps>>["gaps"][number] | null, fallbackDetail: string) {
  if (!gap) return fallbackDetail;
  const suggestions = gap.staffSuggestionNames?.length
    ? ` Suggested staff: ${gap.staffSuggestionNames.slice(0, 5).join(", ")}.`
    : "";
  const coverage = typeof gap.requiredCrew === "number"
    ? ` Crew visible: ${gap.assignedCrewCount || 0}/${gap.requiredCrew}.`
    : "";
  return `${gap.reason} ${gap.recommendedAction}${coverage}${suggestions}`.trim();
}

async function readLinkedRosterActions(dedupeKeys: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !dedupeKeys.length) return new Map<string, { id: string; status: string; title: string }>();

  const { data } = await supabase
    .from("odin_memory")
    .select("facts,source_id,title,last_response")
    .eq("source_type", "action_item");

  const memoryRows = ((data || []) as Array<{
    facts?: { dedupeKey?: string } | null;
    source_id?: string | null;
    title?: string | null;
    last_response?: Record<string, unknown> | null;
  }>).filter((row) => row.source_id && row.facts?.dedupeKey && dedupeKeys.includes(row.facts.dedupeKey));
  const actionIds = Array.from(new Set(memoryRows.map((row) => row.source_id).filter(Boolean) as string[]));
  if (!actionIds.length) return new Map();

  const { data: actionRows } = await supabase
    .from("action_items")
    .select("id,status,title")
    .in("id", actionIds);
  const actions = new Map(((actionRows || []) as Array<{ id: string; status: string; title: string }>).map((row) => [row.id, row]));
  const linked = new Map<string, { id: string; status: string; title: string }>();

  memoryRows.forEach((row) => {
    const action = row.source_id ? actions.get(row.source_id) : undefined;
    if (row.facts?.dedupeKey && action && action.status !== "closed") {
      linked.set(row.facts.dedupeKey, action);
    }
  });

  return linked;
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const result = await buildOdinRosterGaps();
  const linkedActions = await readLinkedRosterActions(result.gaps.map((gap) => gap.dedupeKey));
  const gaps = result.gaps.map((gap) => {
    const linkedAction = linkedActions.get(gap.dedupeKey);
    return {
      ...gap,
      alreadyActioned: Boolean(linkedAction),
      linkedActionId: linkedAction?.id || null,
      linkedActionStatus: linkedAction?.status || null,
      linkedActionHref: linkedAction ? `/actions/${linkedAction.id}` : null
    };
  });
  return NextResponse.json({
    ...result,
    gapCount: gaps.length,
    actionedGapCount: gaps.filter((gap) => gap.alreadyActioned).length,
    gaps,
    instructions: {
      purpose: "Roster gap detection for Odin. It recommends manager actions only and does not message staff or change rosters.",
      createManagerAction: "POST /api/odin/roster-gaps with action=create and a gapId or title/detail/region/dueAt."
    }
  });
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const payload = await request.json().catch(() => ({}));
  const action = String(payload.action || "create").toLowerCase();
  if (action !== "create") return NextResponse.json({ connected: false, error: "Roster gaps currently support create manager action only." }, { status: 400 });

  const actor = permission.kind === "toc" ? permission.user : undefined;
  const gaps = await buildOdinRosterGaps();
  const gap = typeof payload.gapId === "string" ? gaps.gaps.find((item) => item.id === payload.gapId) || null : null;
  const linkedActions = await readLinkedRosterActions(gap?.dedupeKey ? [gap.dedupeKey] : []);
  const linkedAction = gap?.dedupeKey ? linkedActions.get(gap.dedupeKey) : undefined;
  if (gap && linkedAction) {
    return NextResponse.json({
      connected: true,
      action: "already_actioned",
      gapId: gap.id,
      dedupeKey: gap.dedupeKey,
      linkedActionId: linkedAction.id,
      linkedActionStatus: linkedAction.status,
      linkedActionHref: `/actions/${linkedAction.id}`,
      createdActionIds: [],
      createdCount: 0
    });
  }

  const detail = payload.detail || payload.recommendedAction || actionDetailForGap(gap, "Odin identified a roster gap requiring manager action.");

  const result = await createOdinDirectActionItems({
    actorKind: permission.kind,
    actor,
    payload: {
      title: payload.title || gap?.title || "Roster gap requires manager review",
      detail,
      region: payload.region || gap?.region || "National",
      targetRegions: payload.targetRegions || [payload.region || gap?.region || "National"],
      dueAt: payload.dueAt || gap?.dueAt || null,
      sourcePage: "Staff Availability",
      directiveType: payload.directiveType || "Scheduled Directive",
      priority: payload.priority || (gap?.severity === "red" ? "urgent" : "high"),
      severity: gap?.severity || payload.severity || "amber",
      sourceType: "odin_roster_gap",
      entityType: gap?.entityType,
      entityId: gap?.entityId,
      issueType: gap?.gapType || "roster-gap",
      category: "roster-gap",
      dedupeKey: gap?.dedupeKey,
      recommendedAction: payload.recommendedAction || gap?.recommendedAction,
      staffSuggestions: gap?.staffSuggestionNames || []
    }
  });

  await logTocAudit({
    actor,
    action: "odin.roster_gap.action_create",
    entityTable: "action_items",
    entityId: result.createdActionIds[0],
    details: { gapId: payload.gapId || gap?.id || null, dedupeKey: gap?.dedupeKey || null, result, actorType: permission.kind }
  });

  return NextResponse.json({ connected: true, action: "create", ...result });
}
