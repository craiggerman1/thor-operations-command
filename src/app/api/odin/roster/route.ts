import { NextResponse } from "next/server";
import { createOdinDirectActionItems } from "@/lib/odin-actions";
import { logTocAudit } from "@/lib/audit";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { buildOdinRosterGaps } from "@/lib/odin-roster-gaps";
import { readOdinStaffEntities } from "@/lib/odin-staff";
import { getSupabaseAdminClient } from "@/lib/supabase";

async function readSheetSourceSetting(slug: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", `sheet_source_settings_${slug}`)
    .maybeSingle();

  return data?.value || null;
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const [staffAvailabilitySource, inductionsSource] = await Promise.all([
    readSheetSourceSetting("staff-availability"),
    readSheetSourceSetting("inductions")
  ]);
  const [staffResult, rosterGaps] = await Promise.all([
    readOdinStaffEntities({ includeProtected: true }),
    buildOdinRosterGaps()
  ]);

  return NextResponse.json({
    connected: true,
    mode: "roster_readiness_snapshot",
    staff: {
      source: staffResult.source,
      connected: staffResult.connected,
      count: staffResult.staff.length,
      protectedFieldsIncluded: staffResult.protectedFieldsIncluded,
      error: staffResult.error
    },
    rosterGaps,
    sources: {
      staffAvailability: staffAvailabilitySource,
      inductions: inductionsSource,
      liveRoster: {
        connected: false,
        status: "not_loaded",
        nextStep: "Connect TOC to the roster/job planning source so Odin can compare availability, inductions and scheduled jobs."
      }
    },
    instructions: {
      createRosterGapAction: "POST /api/odin/roster with action=create and title/detail/region/dueAt to push a manager roster follow-up into Action Centre.",
      dedicatedRosterGapEndpoint: "GET /api/odin/roster-gaps for detected gaps. POST /api/odin/roster-gaps with gapId to convert a gap into a manager action.",
      staffEndpoint: "GET /api/odin/staff for staff entities, protected contact fields, availability and induction links.",
      staffAvailabilitySource: "Use /api/odin/snapshot and /api/staff-availability for visible availability state until live roster tables are connected.",
      prohibitedActions: ["message_staff_without_rule", "change_roster_without_approval"]
    }
  });
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const payload = await request.json().catch(() => ({}));
  const action = String(payload.action || "create").toLowerCase();
  const actor = permission.kind === "toc" ? permission.user : undefined;

  if (action !== "create") {
    return NextResponse.json({ connected: false, error: "Roster endpoint currently supports create for roster-gap Action Centre follow-ups. Use /api/odin/actions for update/close/delete lifecycle by id." }, { status: 400 });
  }

  try {
    const result = await createOdinDirectActionItems({
      actorKind: permission.kind,
      actor,
      payload: {
        ...payload,
        sourcePage: "Staff Availability",
        directiveType: payload.directiveType || "Scheduled Directive",
        priority: payload.priority || "high",
        title: payload.title || "Roster gap requires manager review",
        detail: payload.detail || payload.recommendedAction || "Odin identified a roster or staff availability gap requiring manager follow-up."
      }
    });

    await logTocAudit({
      actor,
      action: "odin.roster.action_create",
      entityTable: "action_items",
      entityId: result.createdActionIds[0],
      details: { result, actorType: permission.kind }
    });

    return NextResponse.json({ connected: true, action: "create", ...result });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Odin roster request could not be completed." }, { status: 400 });
  }
}
