import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { calendarWeeks } from "@/lib/toc-data";
import type { CalendarDay, CalendarJob, Status } from "@/lib/toc-data";
import { getCalendarDate, updateCalendarJob } from "@/lib/calendar-utils";

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

function emptyCalendarWeeks() {
  return calendarWeeks.map((week) => week.map((day) => ({ ...day, jobs: [] as CalendarJob[] })));
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

async function readCalendar() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { weeks: emptyCalendarWeeks(), connected: false, error: "Supabase server key is not configured." };
  }

  const { data, error } = await supabase
    .from("calendar_jobs")
    .select("id,job_date,job_time,location,site,crew,job_title,status,notes,severity,recurrence,recurrence_detail,recurrence_interval_weeks")
    .order("job_date", { ascending: true })
    .order("job_time", { ascending: true });

  if (error) return { weeks: emptyCalendarWeeks(), connected: false, error: error.message };
  return { weeks: mergeJobsIntoWeeks((data as CalendarJobRow[] | null) || []), connected: true };
}

export async function GET() {
  const result = await readCalendar();
  return NextResponse.json(result, { status: result.connected ? 200 : 503 });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "update";
  const job = payload.job as CalendarJob | undefined;

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

  return GET();
}
