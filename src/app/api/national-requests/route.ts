import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

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

function actionStatusForRequest(status: string) {
  if (status === "Approved by national") return "closed";
  if (status === "Returned to manager") return "returned_to_manager";
  return "submitted_for_review";
}

function mapRequest(row: NationalRequestRow) {
  const region = firstRelated(row.region);

  return {
    id: row.id,
    actionId: row.source_action_id || "",
    title: row.title,
    region: region?.name || "National",
    source: row.source_page || "Action Centre",
    directive: row.directive_type || "National Ops Directive",
    submittedAt: row.created_at,
    managerResponse: row.manager_response || row.detail || "No manager response supplied.",
    evidence: row.evidence || "No evidence or reference supplied.",
    status: displayStatus(row.status)
  };
}

export async function GET() {
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

  return NextResponse.json({ requests: ((data as NationalRequestRow[] | null) || []).map(mapRequest), connected: true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "create") {
    const actionId = payload.actionId;
    if (!actionId) return NextResponse.json({ error: "Action id is required." }, { status: 400 });

    const { data: actionRow, error: actionError } = await supabase
      .from("action_items")
      .select("id,title,detail,source_page,directive_type,assigned_region_id")
      .eq("id", actionId)
      .maybeSingle();

    if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });
    if (!actionRow) return NextResponse.json({ error: "Action item was not found." }, { status: 404 });

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
      detail: payload.managerResponse || actionRow.detail || "Manager submitted action close-out.",
      status: "awaiting_review",
      source_action_id: actionId,
      assigned_region_id: actionRow.assigned_region_id,
      manager_response: payload.managerResponse || "Manager submitted close-out with no additional response.",
      evidence: payload.evidence || "No evidence or reference supplied.",
      source_page: actionRow.source_page,
      directive_type: actionRow.directive_type,
      national_response: null,
      reviewed_at: null,
      updated_at: new Date().toISOString()
    };

    if (existingRequest?.id) {
      const { error: updateRequestError } = await supabase
        .from("national_requests")
        .update(requestPayload)
        .eq("id", existingRequest.id);

      if (updateRequestError) return NextResponse.json({ error: updateRequestError.message }, { status: 500 });
    } else {
      const { error: insertError } = await supabase.from("national_requests").insert(requestPayload);
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from("action_items")
      .update({ status: "submitted_for_review", updated_at: new Date().toISOString(), closed_at: null })
      .eq("id", actionId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return GET();
  }

  if (action === "update") {
    const requestId = payload.id;
    const status = payload.status || "Awaiting national review";

    if (!requestId) return NextResponse.json({ error: "National request id is required." }, { status: 400 });

    const { data: existingRequest, error: readError } = await supabase
      .from("national_requests")
      .select("source_action_id")
      .eq("id", requestId)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const dbStatus = storageStatus(status);
    const isApproved = status === "Approved by national";
    const { error: requestError } = await supabase
      .from("national_requests")
      .update({
        status: dbStatus,
        national_response: payload.nationalResponse || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", requestId);

    if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });

    if (existingRequest?.source_action_id) {
      const { error: actionError } = await supabase
        .from("action_items")
        .update({ status: actionStatusForRequest(status), updated_at: new Date().toISOString(), closed_at: isApproved ? new Date().toISOString() : null })
        .eq("id", existingRequest.source_action_id);

      if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    return GET();
  }

  return NextResponse.json({ error: "Unsupported national request action." }, { status: 400 });
}
