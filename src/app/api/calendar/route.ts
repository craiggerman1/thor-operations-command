import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocScope, requireTocUser } from "@/lib/toc-auth";
import type { CalendarDay, CalendarJob, Status } from "@/lib/toc-data";
import { generateCalendarWeeks, getCalendarDate } from "@/lib/calendar-utils";

type CalendarJobRow = {
  id: string;
  job_date: string;
  job_time: string;
  location: string;
  site: string;
  crew: string;
  job_title: string;
  status: string;
  notes: string | null;
  severity: Status;
  recurrence: string | null;
  recurrence_detail: string | null;
  recurrence_interval_weeks: number | null;
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mapRowToJob(row: CalendarJobRow): CalendarJob {
  return {
    id: row.id,
    time: row.job_time,
    location: row.location,
    site: row.site,
    crew: row.crew,
    job: row.job_title,
    status: row.status,
    notes: row.notes || "",
    severity: row.severity,
    recurrence: row.recurrence || "None",
    recurrenceDetail: row.recurrence_detail || undefined,
    recurrenceIntervalWeeks: row.recurrence_interval_weeks || undefined
  };
}

function mapRowToAdminJob(row: CalendarJobRow) {
  return {
    id: row.id,
    date: row.job_date,
    time: row.job_time,
    location: row.location,
    site: row.site,
    crew: row.crew,
    job: row.job_title,
    status: row.status,
    notes: row.notes || "",
    severity: row.severity,
    recurrence: row.recurrence || "None",
    recurrenceDetail: row.recurrence_detail || "",
    recurrenceIntervalWeeks: row.recurrence_interval_weeks || 0
  };
}

function getRecurrenceStepDays(recurrence: string, intervalWeeks?: number | null) {
  if (recurrence === "Daily") return 1;
  if (recurrence === "Weekly") return 7;
  if (recurrence === "Fortnightly") return 14;
  if (recurrence === "4 weekly") return 28;
  if (recurrence === "Custom" && intervalWeeks && intervalWeeks > 0) return intervalWeeks * 7;
  return null;
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function buildRecurringRows(baseRow: Record<string, unknown>, startDate: string, recurrence: string, intervalWeeks?: number | null) {
  const stepDays = getRecurrenceStepDays(recurrence, intervalWeeks);
  if (!stepDays) return [baseRow];

  return Array.from({ length: 12 }, (_, index) => ({
    ...baseRow,
    job_date: index === 0 ? startDate : addDaysToIsoDate(startDate, stepDays * index)
  }));
}

function emptyCalendarWeeks() {
  return generateCalendarWeeks().map((week) => week.map((day) => ({ ...day, jobs: [] as CalendarJob[] })));
}

function mergeJobsIntoWeeks(rows: CalendarJobRow[]) {
  const jobsByDate = rows.reduce((lookup, row) => {
    lookup[row.job_date] = [...(lookup[row.job_date] || []), mapRowToJob(row)];
    return lookup;
  }, {} as Record<string, CalendarJob[]>);

  return emptyCalendarWeeks().map((week) => week.map((day) => {
    const calendarDate = getCalendarDate(day);
    const key = calendarDate ? dateKey(calendarDate) : "";
    return {
      ...day,
      jobs: (jobsByDate[key] || []).sort((a, b) => a.time.localeCompare(b.time))
    };
  }));
}

function getCalendarScope(request: Request) {
  const url = new URL(request.url);
  return {
    scope: url.searchParams.get("scope") || "National",
    all: url.searchParams.get("all") === "true"
  };
}

async function readCalendar(request: Request) {
  const url = new URL(request.url);
  const scopePermission = await requireTocScope(request, url.searchParams.get("scope") || (url.searchParams.get("all") === "true" ? "National" : null));
  if (scopePermission.error) {
    return { weeks: emptyCalendarWeeks(), jobs: [], connected: false, error: "You do not have permission to view this TOC scope.", status: 403 };
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { weeks: emptyCalendarWeeks(), connected: false, error: "Supabase server key is not configured." };
  }

  const { all } = getCalendarScope(request);
  const scope = scopePermission.scope;
  let query = supabase
    .from("calendar_jobs")
    .select("id,job_date,job_time,location,site,crew,job_title,status,notes,severity,recurrence,recurrence_detail,recurrence_interval_weeks")
    .order("job_date", { ascending: true })
    .order("job_time", { ascending: true });

  if (!all && scope !== "National") {
    query = query.in("location", [scope, "National"]);
  }

  const { data, error } = await query;
  const rows = (data as CalendarJobRow[] | null) || [];
  if (error) return { weeks: emptyCalendarWeeks(), jobs: [], connected: false, error: error.message };
  return { weeks: mergeJobsIntoWeeks(rows), jobs: rows.map(mapRowToAdminJob), connected: true, scope };
}

export async function GET(request: Request) {
  const result = await readCalendar(request);
  return NextResponse.json(result, { status: result.connected ? 200 : "status" in result ? Number(result.status) : 503 });
}

export async function POST(request: Request) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "update";
  const job = payload.job as CalendarJob | undefined;
  const scope = payload.scope || "National";
  const all = Boolean(payload.all);
  const responseRequest = new Request(`${request.url}?scope=${encodeURIComponent(scope)}${all ? "&all=true" : ""}`);

  if (action === "create") {
    const jobDate = String(payload.date || "").trim();
    const jobTitle = String(payload.job || "").trim();
    if (!jobDate || !jobTitle) return NextResponse.json({ error: "Calendar date and job title are required." }, { status: 400 });

    const recurrence = payload.recurrence || "None";
    const recurrenceIntervalWeeks = recurrence === "Custom" ? Number(payload.recurrenceIntervalWeeks) || null : null;
    const baseRow = {
      job_date: jobDate,
      job_time: payload.time || "07:00",
      location: payload.location || "National",
      site: payload.site || "Unassigned site",
      crew: payload.crew || "Unassigned crew",
      job_title: jobTitle,
      status: payload.status || "Scheduled",
      notes: payload.notes || "",
      severity: payload.severity || "green",
      recurrence,
      recurrence_detail: payload.recurrenceDetail || null,
      recurrence_interval_weeks: recurrenceIntervalWeeks
    };
    const { error } = await supabase.from("calendar_jobs").insert(buildRecurringRows(baseRow, jobDate, recurrence, recurrenceIntervalWeeks));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(responseRequest);
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "Calendar job id is required." }, { status: 400 });
    const { error } = await supabase.from("calendar_jobs").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(responseRequest);
  }

  if (action !== "update" || !payload.id || !job) {
    return NextResponse.json({ error: "Calendar job id and job payload are required." }, { status: 400 });
  }

  const { data: existingRow, error: readError } = await supabase
    .from("calendar_jobs")
    .select("id,job_date,job_time,location,site,crew,job_title,status,notes,severity,recurrence,recurrence_detail,recurrence_interval_weeks")
    .eq("id", payload.id)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!existingRow) return NextResponse.json({ error: "Calendar job was not found." }, { status: 404 });

  const updates = {
    job_time: job.time,
    location: job.location,
    site: job.site,
    crew: job.crew,
    job_title: job.job,
    status: job.status,
    notes: job.notes,
    severity: job.severity,
    recurrence: job.recurrence || "None",
    recurrence_detail: job.recurrenceDetail || null,
    recurrence_interval_weeks: job.recurrenceIntervalWeeks || null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("calendar_jobs").update(updates).eq("id", payload.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return GET(responseRequest);
}
