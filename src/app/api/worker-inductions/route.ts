import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { canAccessScope, hasNationalAccess, requireTocScope, requireTocUser } from "@/lib/toc-auth";

export const dynamic = "force-dynamic";

const validStatuses = ["ready_for_documents", "documents_issued", "manager_contacted", "archived"] as const;

type WorkerInductionStatus = typeof validStatuses[number];

type RegionRow = {
  id: string;
  name: string;
};

type WorkerInductionRow = {
  id: string;
  created_at: string;
  completed_at: string;
  status: WorkerInductionStatus;
  preferred_region: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  availability_notes: string | null;
  licence_type: string | null;
  has_transport: boolean;
  manager_notes: string | null;
  issued_documents_at: string | null;
  region?: { name: string } | { name: string }[] | null;
};

function cleanText(value: unknown, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanEmail(value: unknown) {
  return cleanText(value, 180).toLowerCase();
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function mapSubmission(row: WorkerInductionRow) {
  const region = firstRelated(row.region)?.name || row.preferred_region;
  return {
    id: row.id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    status: row.status,
    statusLabel: statusLabel(row.status),
    region,
    name: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    phone: row.phone,
    address: [row.address, row.suburb, row.state, row.postcode].filter(Boolean).join(", "),
    availabilityNotes: row.availability_notes || "",
    licenceType: row.licence_type || "",
    hasTransport: row.has_transport,
    managerNotes: row.manager_notes || "",
    issuedDocumentsAt: row.issued_documents_at
  };
}

function statusLabel(status: WorkerInductionStatus) {
  if (status === "ready_for_documents") return "Ready for documents";
  if (status === "documents_issued") return "Documents issued";
  if (status === "manager_contacted") return "Manager contacted";
  return "Archived";
}

async function getRegionByName(name: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("regions")
    .select("id,name")
    .eq("is_active", true)
    .ilike("name", name)
    .maybeSingle();

  return data as RegionRow | null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedScope = url.searchParams.get("scope") || "National";
  const scopePermission = await requireTocScope(request, requestedScope);
  if (scopePermission.error) return scopePermission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, submissions: [], error: "Supabase server key is not configured." }, { status: 503 });

  let query = supabase
    .from("worker_induction_submissions")
    .select("id,created_at,completed_at,status,preferred_region,first_name,last_name,email,phone,address,suburb,state,postcode,availability_notes,licence_type,has_transport,manager_notes,issued_documents_at,region:regions(name)")
    .neq("status", "archived")
    .order("completed_at", { ascending: false })
    .limit(50);

  if (scopePermission.scope !== "National") {
    query = query.eq("preferred_region", scopePermission.scope);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ connected: false, submissions: [], error: error.message }, { status: 500 });

  const submissions = ((data || []) as WorkerInductionRow[]).map(mapSubmission);
  return NextResponse.json({
    connected: true,
    scope: scopePermission.scope,
    readyCount: submissions.filter((item) => item.status === "ready_for_documents").length,
    submissions
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Induction intake is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));
  if (cleanText(payload.companyWebsite, 100)) {
    return NextResponse.json({ error: "Submission could not be accepted." }, { status: 400 });
  }

  const firstName = cleanText(payload.firstName, 80);
  const lastName = cleanText(payload.lastName, 80);
  const email = cleanEmail(payload.email);
  const phone = cleanText(payload.phone, 40);
  const preferredRegion = cleanText(payload.region, 80);
  const workRightsConfirmed = payload.workRightsConfirmed === true;
  const safetyAcknowledged = payload.safetyAcknowledged === true;
  const privacyAcknowledged = payload.privacyAcknowledged === true;

  if (!firstName || !lastName || !email || !phone || !preferredRegion) {
    return NextResponse.json({ error: "Name, email, phone and preferred region are required." }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (!workRightsConfirmed || !safetyAcknowledged || !privacyAcknowledged) {
    return NextResponse.json({ error: "Required induction confirmations must be accepted." }, { status: 400 });
  }

  const region = await getRegionByName(preferredRegion);
  if (!region || region.name === "National") {
    return NextResponse.json({ error: "Select a valid work region." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("worker_induction_submissions")
    .insert({
      preferred_region: region.name,
      region_id: region.id,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      address: cleanText(payload.address, 220) || null,
      suburb: cleanText(payload.suburb, 80) || null,
      state: cleanText(payload.state, 40) || null,
      postcode: cleanText(payload.postcode, 20) || null,
      availability_notes: cleanText(payload.availabilityNotes, 700) || null,
      licence_type: cleanText(payload.licenceType, 120) || null,
      has_transport: payload.hasTransport === true,
      work_rights_confirmed: workRightsConfirmed,
      safety_acknowledged: safetyAcknowledged,
      privacy_acknowledged: privacyAcknowledged,
      induction_version: cleanText(payload.inductionVersion, 80) || "thor-company-induction-v1"
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logTocAudit({
    action: "worker_induction.completed",
    entityTable: "worker_induction_submissions",
    entityId: data.id,
    scope: region.name,
    details: { region: region.name, email, inductionVersion: cleanText(payload.inductionVersion, 80) || "thor-company-induction-v1" }
  });

  return NextResponse.json({ connected: true, id: data.id, status: "ready_for_documents", region: region.name });
}

export async function PATCH(request: Request) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));
  const id = cleanText(payload.id, 80);
  const status = cleanText(payload.status, 40) as WorkerInductionStatus;
  const managerNotes = cleanText(payload.managerNotes, 700);

  if (!id || !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Valid submission ID and status are required." }, { status: 400 });
  }

  const { data: existing, error: readError } = await supabase
    .from("worker_induction_submissions")
    .select("id,preferred_region")
    .eq("id", id)
    .maybeSingle();

  if (readError || !existing) {
    return NextResponse.json({ error: readError?.message || "Worker induction submission was not found." }, { status: 404 });
  }

  if (!hasNationalAccess(permission.user) && !canAccessScope(permission.user, existing.preferred_region)) {
    return NextResponse.json({ error: "You do not have permission to update this induction region." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status,
    manager_notes: managerNotes || null,
    updated_at: now
  };
  if (status === "documents_issued") updates.issued_documents_at = now;
  if (status === "archived") updates.archived_at = now;

  const { data, error } = await supabase
    .from("worker_induction_submissions")
    .update(updates)
    .eq("id", id)
    .select("id,status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logTocAudit({
    actor: permission.user,
    action: "worker_induction.status_update",
    entityTable: "worker_induction_submissions",
    entityId: id,
    scope: existing.preferred_region,
    details: { status, managerNotes }
  });

  return NextResponse.json({ connected: true, submission: data });
}
