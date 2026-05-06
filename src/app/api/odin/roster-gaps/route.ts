import { NextResponse } from "next/server";
import { createOdinDirectActionItems } from "@/lib/odin-actions";
import { logTocAudit } from "@/lib/audit";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { buildOdinRosterGaps } from "@/lib/odin-roster-gaps";

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const result = await buildOdinRosterGaps();
  return NextResponse.json({
    ...result,
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
  const gap = typeof payload.gapId === "string" ? gaps.gaps.find((item) => item.id === payload.gapId) : null;

  const result = await createOdinDirectActionItems({
    actorKind: permission.kind,
    actor,
    payload: {
      title: payload.title || gap?.title || "Roster gap requires manager review",
      detail: payload.detail || payload.recommendedAction || gap?.recommendedAction || "Odin identified a roster gap requiring manager action.",
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
      recommendedAction: payload.recommendedAction || gap?.recommendedAction
    }
  });

  await logTocAudit({
    actor,
    action: "odin.roster_gap.action_create",
    entityTable: "action_items",
    entityId: result.createdActionIds[0],
    details: { gapId: payload.gapId || gap?.id || null, result, actorType: permission.kind }
  });

  return NextResponse.json({ connected: true, action: "create", ...result });
}
