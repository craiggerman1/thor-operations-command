import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { canAccessScope, hasNationalAccess, requireTocUser, type TocAuthenticatedUser } from "@/lib/toc-auth";

type RegionRow = {
  id: string;
  name: string;
};

type OperationSiteRow = {
  id: string;
  client_name: string;
  site_name: string;
  region_id: string | null;
  address: string;
  site_contact_name: string;
  site_contact_phone: string;
  site_contact_email: string;
  required_induction: boolean;
  required_crew_count: number;
  site_rules: string;
  hazards: string;
  notes: string;
  status: string;
  updated_at: string | null;
  region?: { name: string } | { name: string }[] | null;
};

type SiteScheduleRow = {
  id: string;
  site_id: string;
  region_id: string | null;
  schedule_name: string;
  start_date: string;
  end_date: string | null;
  job_time: string;
  recurrence: string;
  recurrence_interval_weeks: number;
  required_crew_count: number;
  job_title: string;
  notes: string;
  status: string;
  last_generated_until: string | null;
  updated_at: string | null;
  site?: OperationSiteRow | OperationSiteRow[] | null;
  region?: { name: string } | { name: string }[] | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedStatuses = ["active", "inactive", "watch"];
const allowedScheduleStatuses = ["active", "inactive"];
const allowedRecurrences = ["None", "Daily", "Weekly", "Fortnightly", "4 weekly", "Custom"];

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function isUuid(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value);
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateOnly(date);
}

function recurrenceStepDays(recurrence: string, intervalWeeks: number) {
  if (recurrence === "Daily") return 1;
  if (recurrence === "Weekly") return 7;
  if (recurrence === "Fortnightly") return 14;
  if (recurrence === "4 weekly") return 28;
  if (recurrence === "Custom") return intervalWeeks * 7;
  return null;
}

async function regionLookup() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();
  const { data, error } = await supabase.from("regions").select("id,name").eq("is_active", true);
  if (error) throw error;
  return new Map(((data as RegionRow[] | null) || []).map((region) => [region.name, region.id]));
}

async function resolveRegionId(regionName: string) {
  const lookup = await regionLookup();
  return lookup.get(regionName) || null;
}

function mapSite(row: OperationSiteRow) {
  const region = firstRelated(row.region);
  return {
    id: row.id,
    clientName: row.client_name,
    siteName: row.site_name,
    region: region?.name || "Unassigned",
    regionId: row.region_id,
    address: row.address || "",
    siteContactName: row.site_contact_name || "",
    siteContactPhone: row.site_contact_phone || "",
    siteContactEmail: row.site_contact_email || "",
    requiredInduction: row.required_induction,
    requiredCrewCount: row.required_crew_count,
    siteRules: row.site_rules || "",
    hazards: row.hazards || "",
    notes: row.notes || "",
    status: row.status,
    updatedAt: row.updated_at
  };
}

function mapSchedule(row: SiteScheduleRow) {
  const site = firstRelated(row.site);
  const region = firstRelated(row.region);
  return {
    id: row.id,
    siteId: row.site_id,
    siteLabel: site ? `${site.client_name} - ${site.site_name}` : "Unassigned site",
    region: region?.name || firstRelated(site?.region)?.name || "Unassigned",
    regionId: row.region_id,
    scheduleName: row.schedule_name || "",
    startDate: row.start_date,
    endDate: row.end_date || "",
    jobTime: row.job_time?.slice(0, 5) || "07:00",
    recurrence: row.recurrence,
    recurrenceIntervalWeeks: row.recurrence_interval_weeks,
    requiredCrewCount: row.required_crew_count,
    jobTitle: row.job_title,
    notes: row.notes || "",
    status: row.status,
    lastGeneratedUntil: row.last_generated_until || "",
    updatedAt: row.updated_at
  };
}

function regionIsWritable(user: TocAuthenticatedUser, regionName: string) {
  return hasNationalAccess(user) || canAccessScope(user, regionName);
}

async function getRowRegionName(table: "operation_sites" | "site_schedules", id: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from(table)
    .select("region:regions(name)")
    .eq("id", id)
    .maybeSingle();
  const row = data as { region?: { name: string } | { name: string }[] | null } | null;
  return firstRelated(row?.region)?.name || null;
}

async function readMasterData(user: TocAuthenticatedUser) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { connected: false, error: "Supabase server key is not configured.", sites: [], schedules: [], staff: [], regions: [] };

  const regionsResult = await supabase.from("regions").select("id,name").eq("is_active", true).order("name", { ascending: true });
  if (regionsResult.error) return { connected: false, error: regionsResult.error.message, sites: [], schedules: [], staff: [], regions: [] };

  const activeRegions = ((regionsResult.data || []) as RegionRow[]).map((region) => ({ id: region.id, name: region.name }));
  const allowedRegions = hasNationalAccess(user)
    ? activeRegions
    : activeRegions.filter((region) => user.regions.includes(region.name) && region.name !== "National");
  const allowedRegionIds = allowedRegions.map((region) => region.id);

  let sitesQuery = supabase
    .from("operation_sites")
    .select("id,client_name,site_name,region_id,address,site_contact_name,site_contact_phone,site_contact_email,required_induction,required_crew_count,site_rules,hazards,notes,status,updated_at,region:regions(name)")
    .order("client_name", { ascending: true })
    .order("site_name", { ascending: true });

  let schedulesQuery = supabase
    .from("site_schedules")
    .select("id,site_id,region_id,schedule_name,start_date,end_date,job_time,recurrence,recurrence_interval_weeks,required_crew_count,job_title,notes,status,last_generated_until,updated_at,region:regions(name),site:operation_sites(id,client_name,site_name,region:regions(name))")
    .order("start_date", { ascending: true })
    .order("job_time", { ascending: true });

  if (!hasNationalAccess(user)) {
    sitesQuery = sitesQuery.in("region_id", allowedRegionIds.length ? allowedRegionIds : ["00000000-0000-0000-0000-000000000000"]);
    schedulesQuery = schedulesQuery.in("region_id", allowedRegionIds.length ? allowedRegionIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const [sitesResult, schedulesResult, staffResult] = await Promise.all([
    sitesQuery,
    schedulesQuery,
    hasNationalAccess(user)
      ? supabase.from("staff_profiles").select("id,display_name,role,status,contact_mobile").order("display_name", { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ]);

  const firstError = sitesResult.error || schedulesResult.error || staffResult.error;
  if (firstError) return { connected: false, error: firstError.message, sites: [], schedules: [], staff: [], regions: [] };

  return {
    connected: true,
    error: null,
    regions: allowedRegions,
    sites: ((sitesResult.data || []) as OperationSiteRow[]).map(mapSite),
    schedules: ((schedulesResult.data || []) as SiteScheduleRow[]).map(mapSchedule),
    staff: ((staffResult.data || []) as Array<{ id: string; display_name: string; role: string; status: string; contact_mobile: string | null }>).map((staff) => ({
      id: staff.id,
      name: staff.display_name,
      role: staff.role,
      status: staff.status,
      mobile: staff.contact_mobile || ""
    }))
  };
}

async function generateScheduleJobs(scheduleId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const { data, error } = await supabase
    .from("site_schedules")
    .select("id,site_id,region_id,schedule_name,start_date,end_date,job_time,recurrence,recurrence_interval_weeks,required_crew_count,job_title,notes,status,site:operation_sites(id,client_name,site_name,region:regions(name))")
    .eq("id", scheduleId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Schedule was not found.");

  const schedule = data as SiteScheduleRow;
  const site = firstRelated(schedule.site);
  if (!site) throw new Error("Schedule is not linked to a valid site.");
  if (schedule.status !== "active") throw new Error("Only active schedules can generate calendar jobs.");

  const stepDays = recurrenceStepDays(schedule.recurrence, schedule.recurrence_interval_weeks || 1);
  const occurrenceCount = stepDays ? 12 : 1;
  const today = dateOnly(new Date());
  const startDate = schedule.start_date < today ? today : schedule.start_date;
  const dates = Array.from({ length: occurrenceCount }, (_, index) => stepDays ? addDaysToIsoDate(startDate, stepDays * index) : startDate)
    .filter((date) => !schedule.end_date || date <= schedule.end_date);

  if (!dates.length) throw new Error("Schedule has no future dates to generate.");

  const { data: existingRows, error: existingError } = await supabase
    .from("calendar_jobs")
    .select("job_date")
    .eq("source_schedule_id", schedule.id)
    .in("job_date", dates);

  if (existingError) throw existingError;
  const existingDates = new Set(((existingRows || []) as Array<{ job_date: string }>).map((row) => row.job_date));
  const regionName = firstRelated(site.region)?.name || "National";
  const rows = dates
    .filter((date) => !existingDates.has(date))
    .map((jobDate) => ({
      job_date: jobDate,
      job_time: schedule.job_time?.slice(0, 5) || "07:00",
      location: regionName,
      site: `${site.client_name} - ${site.site_name}`,
      crew: "Unassigned crew",
      job_title: schedule.job_title || schedule.schedule_name || "Scheduled wash",
      status: "Scheduled",
      notes: schedule.notes || "",
      severity: "green",
      recurrence: schedule.recurrence,
      recurrence_detail: schedule.schedule_name || null,
      recurrence_interval_weeks: schedule.recurrence === "Custom" ? schedule.recurrence_interval_weeks : null,
      site_id: schedule.site_id,
      required_crew_count: schedule.required_crew_count,
      source_schedule_id: schedule.id
    }));

  if (!rows.length) return { created: 0, generatedUntil: dates[dates.length - 1] };

  const { error: insertError } = await supabase.from("calendar_jobs").insert(rows);
  if (insertError) throw insertError;

  const generatedUntil = rows[rows.length - 1].job_date;
  await supabase.from("site_schedules").update({ last_generated_until: generatedUntil, updated_at: new Date().toISOString() }).eq("id", schedule.id);

  return { created: rows.length, generatedUntil };
}

export async function GET(request: Request) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission.error;

  const result = await readMasterData(permission.user);
  return NextResponse.json(result, { status: result.connected ? 200 : 503 });
}

export async function POST(request: Request) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission.error;
  const user = permission.user;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));
  const action = cleanString(payload.action);

  try {
    if (action === "upsertSite") {
      const clientName = cleanString(payload.clientName);
      const siteName = cleanString(payload.siteName);
      if (!clientName || !siteName) return NextResponse.json({ error: "Client and site name are required." }, { status: 400 });
      const regionId = await resolveRegionId(cleanString(payload.region));
      if (!regionId) return NextResponse.json({ error: "A mapped region is required." }, { status: 400 });
      if (!regionIsWritable(user, cleanString(payload.region))) return NextResponse.json({ error: "You can only manage operations master rows for your assigned region." }, { status: 403 });

      const row = {
        client_name: clientName,
        site_name: siteName,
        region_id: regionId,
        address: cleanString(payload.address),
        site_contact_name: cleanString(payload.siteContactName),
        site_contact_phone: cleanString(payload.siteContactPhone),
        site_contact_email: cleanString(payload.siteContactEmail),
        required_induction: payload.requiredInduction !== false,
        required_crew_count: cleanNumber(payload.requiredCrewCount, 2, 0, 20),
        site_rules: cleanString(payload.siteRules),
        hazards: cleanString(payload.hazards),
        notes: cleanString(payload.notes),
        status: allowedStatuses.includes(cleanString(payload.status)) ? cleanString(payload.status) : "active",
        updated_at: new Date().toISOString()
      };

      const query = isUuid(payload.id)
        ? supabase.from("operation_sites").update(row).eq("id", payload.id).select("id").maybeSingle()
        : supabase.from("operation_sites").insert(row).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Site was not found." }, { status: 404 });
      await logTocAudit({ actor: permission.user, action: isUuid(payload.id) ? "admin.operation_site.update" : "admin.operation_site.create", entityTable: "operation_sites", entityId: data.id, scope: cleanString(payload.region), details: { clientName, siteName } });
      return readMasterData(user).then((result) => NextResponse.json(result));
    }

    if (action === "archiveSite") {
      if (!isUuid(payload.id)) return NextResponse.json({ error: "Site id is required." }, { status: 400 });
      const regionName = await getRowRegionName("operation_sites", payload.id);
      if (!regionName || !regionIsWritable(user, regionName)) return NextResponse.json({ error: "You can only archive rows for your assigned region." }, { status: 403 });
      const { error } = await supabase.from("operation_sites").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", payload.id);
      if (error) throw error;
      await logTocAudit({ actor: permission.user, action: "admin.operation_site.archive", entityTable: "operation_sites", entityId: payload.id });
      return readMasterData(user).then((result) => NextResponse.json(result));
    }

    if (action === "upsertSchedule") {
      if (!isUuid(payload.siteId)) return NextResponse.json({ error: "Linked customer/site is required." }, { status: 400 });
      const regionId = await resolveRegionId(cleanString(payload.region));
      if (!regionId) return NextResponse.json({ error: "A mapped region is required." }, { status: 400 });
      if (!regionIsWritable(user, cleanString(payload.region))) return NextResponse.json({ error: "You can only manage schedules for your assigned region." }, { status: 403 });
      const recurrence = allowedRecurrences.includes(cleanString(payload.recurrence)) ? cleanString(payload.recurrence) : "Weekly";
      const row = {
        site_id: payload.siteId,
        region_id: regionId,
        schedule_name: cleanString(payload.scheduleName),
        start_date: cleanString(payload.startDate) || dateOnly(new Date()),
        end_date: cleanString(payload.endDate) || null,
        job_time: cleanString(payload.jobTime) || "07:00",
        recurrence,
        recurrence_interval_weeks: cleanNumber(payload.recurrenceIntervalWeeks, 1, 1, 52),
        required_crew_count: cleanNumber(payload.requiredCrewCount, 2, 0, 20),
        job_title: cleanString(payload.jobTitle) || "Scheduled wash",
        notes: cleanString(payload.notes),
        status: allowedScheduleStatuses.includes(cleanString(payload.status)) ? cleanString(payload.status) : "active",
        updated_at: new Date().toISOString()
      };
      const query = isUuid(payload.id)
        ? supabase.from("site_schedules").update(row).eq("id", payload.id).select("id").maybeSingle()
        : supabase.from("site_schedules").insert(row).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Schedule was not found." }, { status: 404 });
      await logTocAudit({ actor: permission.user, action: isUuid(payload.id) ? "admin.site_schedule.update" : "admin.site_schedule.create", entityTable: "site_schedules", entityId: data.id, scope: cleanString(payload.region), details: { scheduleName: row.schedule_name, recurrence } });
      return readMasterData(user).then((result) => NextResponse.json(result));
    }

    if (action === "archiveSchedule") {
      if (!isUuid(payload.id)) return NextResponse.json({ error: "Schedule id is required." }, { status: 400 });
      const regionName = await getRowRegionName("site_schedules", payload.id);
      if (!regionName || !regionIsWritable(user, regionName)) return NextResponse.json({ error: "You can only archive schedules for your assigned region." }, { status: 403 });
      const { error } = await supabase.from("site_schedules").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", payload.id);
      if (error) throw error;
      await logTocAudit({ actor: permission.user, action: "admin.site_schedule.archive", entityTable: "site_schedules", entityId: payload.id });
      return readMasterData(user).then((result) => NextResponse.json(result));
    }

    if (action === "generateScheduleJobs") {
      if (!isUuid(payload.id)) return NextResponse.json({ error: "Schedule id is required." }, { status: 400 });
      const regionName = await getRowRegionName("site_schedules", payload.id);
      if (!regionName || !regionIsWritable(user, regionName)) return NextResponse.json({ error: "You can only generate jobs for your assigned region." }, { status: 403 });
      const generation = await generateScheduleJobs(payload.id);
      await logTocAudit({ actor: permission.user, action: "admin.site_schedule.generate_calendar_jobs", entityTable: "site_schedules", entityId: payload.id, details: generation });
      const result = await readMasterData(user);
      return NextResponse.json({ ...result, generation });
    }

    return NextResponse.json({ error: "Unsupported operations master action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Operations master request failed." }, { status: 500 });
  }
}
