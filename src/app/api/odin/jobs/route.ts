import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { odinIdsFromPayload, odinOperation } from "@/lib/odin-api-utils";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { getSupabaseAdminClient } from "@/lib/supabase";

function normaliseSeverity(value: unknown) {
  const severity = String(value || "green").toLowerCase();
  if (["red", "amber", "yellow", "green", "blue"].includes(severity)) return severity;
  return "green";
}

function normaliseStatus(value: unknown) {
  const status = String(value || "Scheduled").trim();
  if (!status) return "Scheduled";
  if (["complete", "completed", "done", "closed"].includes(status.toLowerCase())) return "Completed";
  return status;
}

function jobUpdates(payload: Record<string, unknown>) {
  const source = (payload.updates && typeof payload.updates === "object" ? payload.updates : payload) as Record<string, unknown>;
  const updates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };

  if (typeof source.date === "string") updates.job_date = source.date;
  if (typeof source.jobDate === "string") updates.job_date = source.jobDate;
  if (typeof source.time === "string") updates.job_time = source.time;
  if (typeof source.location === "string") updates.location = source.location;
  if (typeof source.region === "string") updates.location = source.region;
  if (typeof source.site === "string") updates.site = source.site;
  if (typeof source.crew === "string") updates.crew = source.crew;
  if (typeof source.job === "string") updates.job_title = source.job;
  if (typeof source.title === "string") updates.job_title = source.title;
  if (typeof source.status === "string") updates.status = normaliseStatus(source.status);
  if (typeof source.notes === "string") updates.notes = source.notes;
  if (typeof source.note === "string") updates.notes = source.note;
  if (typeof source.severity === "string") updates.severity = normaliseSeverity(source.severity);
  if (typeof source.recurrence === "string") updates.recurrence = source.recurrence;
  if (typeof source.recurrenceDetail === "string") updates.recurrence_detail = source.recurrenceDetail;
  if (typeof source.recurrenceIntervalWeeks !== "undefined") updates.recurrence_interval_weeks = Number(source.recurrenceIntervalWeeks) || null;

  return updates;
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const start = url.searchParams.get("start") || new Date().toISOString().slice(0, 10);
  const end = url.searchParams.get("end") || start;
  const { data, error } = await supabase
    .from("calendar_jobs")
    .select("id,job_date,job_time,location,site,crew,job_title,status,notes,severity,updated_at")
    .gte("job_date", start)
    .lte("job_date", end)
    .order("job_date", { ascending: true })
    .order("job_time", { ascending: true });

  if (error) return NextResponse.json({ connected: false, error: error.message }, { status: 500 });
  return NextResponse.json({ connected: true, jobs: data || [], count: data?.length || 0 });
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));
  const actor = permission.kind === "toc" ? permission.user : undefined;

  try {
    const action = odinOperation(payload.action, ["create", "update", "complete", "close", "clear", "done", "delete"]);

    if (action === "create") {
      const jobDate = String(payload.date || payload.jobDate || "").trim();
      const jobTitle = String(payload.job || payload.title || "").trim();
      if (!jobDate || !jobTitle) throw new Error("Job date and title are required.");

      const { data, error } = await supabase.from("calendar_jobs").insert({
        job_date: jobDate,
        job_time: payload.time || "07:00",
        location: payload.location || payload.region || "National",
        site: payload.site || "Unassigned site",
        crew: payload.crew || "Unassigned crew",
        job_title: jobTitle,
        status: normaliseStatus(payload.status),
        notes: payload.notes || payload.note || "Odin-created job record.",
        severity: normaliseSeverity(payload.severity),
        recurrence: payload.recurrence || "None",
        recurrence_detail: payload.recurrenceDetail || null,
        recurrence_interval_weeks: payload.recurrenceIntervalWeeks ? Number(payload.recurrenceIntervalWeeks) : null
      }).select("id").single();

      if (error) throw error;
      await logTocAudit({ actor, action: "odin.job.create", entityTable: "calendar_jobs", entityId: data.id, details: { jobDate, jobTitle, actorType: permission.kind } });
      return NextResponse.json({ connected: true, action: "create", createdJobIds: [data.id], count: 1 });
    }

    const ids = odinIdsFromPayload(payload, ["jobIds", "createdJobIds"]);
    if (!ids.length) throw new Error("Job id or ids are required for non-create operations.");

    if (action === "delete") {
      const { data, error } = await supabase.from("calendar_jobs").delete().in("id", ids).select("id");
      if (error) throw error;
      const deletedJobIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
      await logTocAudit({ actor, action: "odin.job.delete", entityTable: "calendar_jobs", entityId: deletedJobIds[0], details: { requestedIds: ids, deletedJobIds, actorType: permission.kind } });
      return NextResponse.json({ connected: true, action: "delete", deletedJobIds, count: deletedJobIds.length });
    }

    const updates = action === "update" ? jobUpdates(payload) : { status: "Completed", updated_at: new Date().toISOString() };
    if (action === "update" && Object.keys(updates).length <= 1) throw new Error("No supported job updates were supplied.");

    const { data, error } = await supabase.from("calendar_jobs").update(updates).in("id", ids).select("id");
    if (error) throw error;
    const affectedJobIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
    await logTocAudit({ actor, action: action === "update" ? "odin.job.update" : "odin.job.complete", entityTable: "calendar_jobs", entityId: affectedJobIds[0], details: { requestedIds: ids, affectedJobIds, updates, actorType: permission.kind } });
    return NextResponse.json({ connected: true, action, updatedJobIds: action === "update" ? affectedJobIds : undefined, completedJobIds: action !== "update" ? affectedJobIds : undefined, count: affectedJobIds.length });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Odin jobs request could not be completed." }, { status: 400 });
  }
}
