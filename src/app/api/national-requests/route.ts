import { NextResponse } from "next/server";
import { markComplianceForClosedActions, reopenComplianceForReturnedActions } from "@/lib/linked-record-sync";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { canAccessScope, requireTocNationalAccess, requireTocUser } from "@/lib/toc-auth";
import { logTocAudit } from "@/lib/audit";
import { linkEvidenceToNationalRequest, signedActionEvidenceFiles } from "@/lib/action-evidence";

type NationalRequestRow = {
  id: string;
  request_type: string;
  title: string;
  detail: string | null;
  status: "awaiting_review" | "approved" | "returned" | "closed";
  source_action_id: string | null;
  assigned_region_id: string | null;
  manager_response: string | null;
  evidence: string | null;
  source_page: string | null;
  directive_type: string | null;
  created_at: string;
  updated_at?: string | null;
  region?: { name: string } | { name: string }[] | null;
};

type NationalRequestPayload = ReturnType<typeof mapRequest> & {
  attachments: Awaited<ReturnType<typeof signedActionEvidenceFiles>>;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function displayStatus(status: NationalRequestRow["status"]) {
  const labels = {
    awaiting_review: "Awaiting national review",
    approved: "Approved by national",
    returned: "Returned to manager",
    closed: "Approved by national"
  };

  return labels[status];
}

function storageStatus(status: string) {
  if (status === "Approved by national") return "approved";
  if (status === "Returned to manager") return "returned";
  return "awaiting_review";
}

function hoursSince(value: string | null | undefined, now = new Date()) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3600000));
}

function ageLabel(hours: number) {
  if (hours < 1) return "Just submitted";
  if (hours < 24) return `${hours}h waiting`;
  const days = Math.floor(hours / 24);
  return `${days}d waiting`;
}

function actionStatusForRequest(status: string, requestType = "action_closeout") {
  if (requestType === "manager_update" && status === "Approved by national") return null;
  if (status === "Approved by national") return "closed";
  if (status === "Returned to manager") return "returned_to_manager";
  return "submitted_for_review";
}

function closeoutQualityError(input: {
  managerResponse: string;
  evidence: string;
  directiveType?: string | null;
  priority?: string | null;
  sourcePage?: string | null;
}) {
  const managerResponse = input.managerResponse.trim();
  const evidence = input.evidence.trim();
  const materialAction = input.directiveType === "National Ops Directive" ||
    input.priority === "urgent" ||
    input.priority === "high" ||
    /compliance|equipment|stock|jobsheet|safety/i.test(String(input.sourcePage || ""));

  if (managerResponse.length < 10) return "Add a clear manager response before submitting this action for National review.";
  if (materialAction && managerResponse.length < 20) return "For urgent, compliance, equipment, stock or jobsheet actions, add a fuller close-out response before National review.";
  if (materialAction && evidence.length < 8) return "For urgent, compliance, equipment, stock or jobsheet actions, add evidence or a reference before National review.";
  return "";
}

function mapRequest(row: NationalRequestRow) {
  const region = firstRelated(row.region);
  const ageHours = hoursSince(row.created_at);

  return {
    id: row.id,
    requestType: row.request_type,
    actionId: row.source_action_id || "",
    title: row.title,
    region: region?.name || "National",
    source: row.source_page || "Action Centre",
    directive: row.directive_type || "National Ops Directive",
    submittedAt: row.created_at,
    ageHours,
    ageLabel: ageLabel(ageHours),
    stale: ageHours >= 24,
    managerResponse: row.manager_response || row.detail || "No manager response supplied.",
    evidence: row.evidence || "No evidence or reference supplied.",
    status: displayStatus(row.status)
  };
}

async function mapRequestWithAttachments(row: NationalRequestRow): Promise<NationalRequestPayload> {
  return {
    ...mapRequest(row),
    attachments: await signedActionEvidenceFiles({ requestId: row.id })
  };
}

export async function GET(request: Request) {
  const permission = await requireTocNationalAccess(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ requests: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("national_requests")
    .select("id,request_type,title,detail,status,source_action_id,assigned_region_id,manager_response,evidence,source_page,directive_type,created_at,updated_at,region:regions(name)")
    .in("request_type", ["action_closeout", "manager_update", "other"])
    .eq("status", "awaiting_review")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ requests: [], connected: false, error: error.message }, { status: 500 });
  }

  const requests = await Promise.all(((data as NationalRequestRow[] | null) || []).map(mapRequestWithAttachments));
  return NextResponse.json({ requests, connected: true });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const action = payload.action || "create";
  const permission = action === "create"
    ? await requireTocUser(request)
    : await requireTocNationalAccess(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  if (action === "create") {
    const actionId = payload.actionId;
    if (!actionId) return NextResponse.json({ error: "Action id is required." }, { status: 400 });

    const { data: actionRow, error: actionError } = await supabase
      .from("action_items")
      .select("id,title,detail,source_page,directive_type,priority,status,assigned_region_id,region:regions(name)")
      .eq("id", actionId)
      .maybeSingle();

    if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });
    if (!actionRow) return NextResponse.json({ error: "Action item was not found." }, { status: 404 });
    const actionRegion = firstRelated(actionRow.region)?.name || "National";
    if (!canAccessScope(permission.user, actionRegion)) {
      return NextResponse.json({ error: "You do not have permission to submit this action for National review." }, { status: 403 });
    }
    if (actionRow.status === "closed") {
      return NextResponse.json({ error: "This action is already closed." }, { status: 400 });
    }
    if (actionRow.status === "submitted_for_review") {
      return NextResponse.json({ error: "This action is already awaiting National review." }, { status: 400 });
    }

    const managerResponse = String(payload.managerResponse || "").trim();
    const evidence = String(payload.evidence || "").trim();
    const attachmentIds = Array.isArray(payload.attachmentIds) ? (payload.attachmentIds as unknown[]).map((item) => String(item)).filter(Boolean) : [];
    const qualityError = closeoutQualityError({
      managerResponse,
      evidence: evidence || (attachmentIds.length ? "Photo evidence uploaded." : ""),
      directiveType: actionRow.directive_type,
      priority: actionRow.priority,
      sourcePage: actionRow.source_page
    });
    if (qualityError) return NextResponse.json({ error: qualityError }, { status: 400 });

    const { data: existingRequest, error: existingError } = await supabase
      .from("national_requests")
      .select("id,status")
      .eq("source_action_id", actionId)
      .in("status", ["awaiting_review", "returned"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const requestPayload = {
      request_type: "action_closeout",
      title: actionRow.title,
      detail: managerResponse || actionRow.detail || "Manager submitted action close-out.",
      status: "awaiting_review",
      source_action_id: actionId,
      assigned_region_id: actionRow.assigned_region_id,
      manager_response: managerResponse,
      evidence,
      source_page: actionRow.source_page,
      directive_type: actionRow.directive_type,
      national_response: null,
      reviewed_at: null,
      updated_at: new Date().toISOString()
    };

    let requestId = existingRequest?.id || "";
    if (existingRequest?.id) {
      const { error: updateRequestError } = await supabase
        .from("national_requests")
        .update(requestPayload)
        .eq("id", existingRequest.id);

      if (updateRequestError) return NextResponse.json({ error: updateRequestError.message }, { status: 500 });
    } else {
      const { data: insertedRequest, error: insertError } = await supabase.from("national_requests").insert(requestPayload).select("id").single();
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      requestId = insertedRequest.id;
    }

    await linkEvidenceToNationalRequest({ attachmentIds, actionId, requestId });

    const { error: updateError } = await supabase
      .from("action_items")
      .update({ status: "submitted_for_review", updated_at: new Date().toISOString(), closed_at: null })
      .eq("id", actionId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return GET(request);
  }

  if (action === "update") {
    const requestId = payload.id;
    const status = payload.status || "Awaiting national review";
    const nationalResponse = String(payload.nationalResponse || "").trim();

    if (!requestId) return NextResponse.json({ error: "National request id is required." }, { status: 400 });
    if (status === "Returned to manager" && nationalResponse.length < 5) {
      return NextResponse.json({ error: "Add a clear return reason before sending this back to the manager." }, { status: 400 });
    }

    const { data: existingRequest, error: readError } = await supabase
      .from("national_requests")
      .select("source_action_id,request_type")
      .eq("id", requestId)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const dbStatus = storageStatus(status);
    const isApproved = status === "Approved by national";
    const { error: requestError } = await supabase
      .from("national_requests")
      .update({
        status: dbStatus,
        national_response: nationalResponse || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", requestId);

    if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });

    if (existingRequest?.source_action_id) {
      const nextActionStatus = actionStatusForRequest(status, existingRequest.request_type);
      if (!nextActionStatus) {
        await logTocAudit({
          actor: permission.user,
          action: "national.manager_update.acknowledge",
          entityTable: "national_requests",
          entityId: requestId,
          details: { sourceActionId: existingRequest.source_action_id, status, nationalResponse: nationalResponse || null }
        });
        return GET(request);
      }
      const { error: actionError } = await supabase
        .from("action_items")
        .update({ status: nextActionStatus, updated_at: new Date().toISOString(), closed_at: isApproved ? new Date().toISOString() : null })
        .eq("id", existingRequest.source_action_id);

      if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });
      if (isApproved) {
        await markComplianceForClosedActions([existingRequest.source_action_id]);
      } else if (status === "Returned to manager") {
        await reopenComplianceForReturnedActions([existingRequest.source_action_id]);
      }
    }
    await logTocAudit({
      actor: permission.user,
      action: "national.request.update",
      entityTable: "national_requests",
      entityId: requestId,
      details: { status, requestType: existingRequest?.request_type || null, nationalResponse: nationalResponse || null }
    });

    return GET(request);
  }

  return NextResponse.json({ error: "Unsupported national request action." }, { status: 400 });
}
