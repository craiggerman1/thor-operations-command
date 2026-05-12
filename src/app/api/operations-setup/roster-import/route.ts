import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { canAccessScope, hasNationalAccess, requireTocScope, type TocAuthenticatedUser } from "@/lib/toc-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegionRow = { id: string; name: string };
type StaffRow = {
  id: string;
  display_name: string;
  availability_sheet_name: string | null;
  induction_sheet_name: string | null;
  primary_region_id: string | null;
};
type StaffRegionRow = { staff_profile_id: string; region_id: string };
type OperationSiteRow = { id: string; client_name: string; site_name: string; region_id: string | null };
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
  wash_asset?: string | null;
  site?: { client_name: string; site_name: string; region?: { name: string } | { name: string }[] | null } | { client_name: string; site_name: string; region?: { name: string } | { name: string }[] | null }[] | null;
};

type ImportRow = {
  rowNumber: number;
  region: string;
  clientName: string;
  siteName: string;
  siteAddress: string;
  jobDay: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  frequency: string;
  staffRequired: number;
  rosteredStaff: string[];
  washAsset: string;
  jobTitle: string;
  notes: string;
  active: boolean;
};

type PreviewRow = ImportRow & {
  status: "valid" | "warning" | "error";
  messages: string[];
  matchedStaff: Array<{ name: string; id: string }>;
  unmatchedStaff: string[];
  recurrence: string;
  recurrenceIntervalWeeks: number;
  resolvedStartDate: string;
  duplicateHint: string;
};

const headerAliases: Record<string, keyof ImportRow> = {
  region: "region",
  "client name": "clientName",
  client: "clientName",
  "site name": "siteName",
  site: "siteName",
  "site address": "siteAddress",
  address: "siteAddress",
  "job day": "jobDay",
  day: "jobDay",
  "start date": "startDate",
  "end date": "endDate",
  "start time": "startTime",
  time: "startTime",
  "end time": "endTime",
  frequency: "frequency",
  recurrence: "frequency",
  "staff required": "staffRequired",
  crew: "staffRequired",
  "required crew": "staffRequired",
  "rostered staff": "rosteredStaff",
  staff: "rosteredStaff",
  "normal staff": "rosteredStaff",
  "wash asset": "washAsset",
  asset: "washAsset",
  unit: "washAsset",
  "job title": "jobTitle",
  job: "jobTitle",
  notes: "notes",
  active: "active",
  status: "active"
};

const dayLookup: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function cleanString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function cleanDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = cleanString(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) return parsed.toISOString().slice(0, 10);
  return raw;
}

function cleanTime(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(11, 16);
  const raw = cleanString(value);
  if (!raw) return "";
  const decimal = Number(raw);
  if (Number.isFinite(decimal) && decimal > 0 && decimal < 1) {
    const minutes = Math.round(decimal * 24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeKey(value: unknown) {
  return cleanTime(value).slice(0, 5);
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateOnly(date);
}

function nextDateForDay(dayName: string) {
  const target = dayLookup[cleanKey(dayName)];
  if (target === undefined) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const offset = (target - today.getDay() + 7) % 7;
  today.setDate(today.getDate() + offset);
  return dateOnly(today);
}

function normaliseFrequency(value: string) {
  const key = cleanKey(value || "Weekly");
  if (key === "daily") return { recurrence: "Daily", recurrenceIntervalWeeks: 1 };
  if (key === "weekly" || key === "week") return { recurrence: "Weekly", recurrenceIntervalWeeks: 1 };
  if (key === "fortnightly" || key === "fortnight" || key === "every 2 weeks") return { recurrence: "Fortnightly", recurrenceIntervalWeeks: 2 };
  if (key === "monthly" || key === "every 4 weeks" || key === "4 weekly" || key === "four weekly") return { recurrence: "4 weekly", recurrenceIntervalWeeks: 4 };
  if (key === "one off" || key === "one-off" || key === "once" || key === "none") return { recurrence: "None", recurrenceIntervalWeeks: 1 };
  return { recurrence: "Weekly", recurrenceIntervalWeeks: 1 };
}

function recurrenceStepDays(recurrence: string, intervalWeeks: number) {
  if (recurrence === "Daily") return 1;
  if (recurrence === "Weekly") return 7;
  if (recurrence === "Fortnightly") return 14;
  if (recurrence === "4 weekly") return 28;
  if (recurrence === "Custom") return intervalWeeks * 7;
  return null;
}

function splitNames(value: unknown) {
  return cleanString(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseActive(value: unknown) {
  const key = cleanKey(value || "yes");
  return !["no", "n", "false", "inactive", "0"].includes(key);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function parseWorkbook(text: string) {
  const [headers, ...dataRows] = parseCsv(text);
  if (!headers?.length) throw new Error("The uploaded CSV has no header row.");
  const rows = dataRows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
  return rows.map((source, index): ImportRow => {
    const mapped: Partial<ImportRow> = { rowNumber: index + 2 };
    Object.entries(source).forEach(([header, value]) => {
      const field = headerAliases[cleanKey(header)];
      if (!field) return;
      if (field === "rosteredStaff") mapped.rosteredStaff = splitNames(value);
      else if (field === "staffRequired") mapped.staffRequired = Math.max(0, Math.min(20, Math.round(Number(value) || 0)));
      else if (field === "active") mapped.active = parseActive(value);
      else if (field === "startDate" || field === "endDate") mapped[field] = cleanDate(value);
      else if (field === "startTime" || field === "endTime") mapped[field] = cleanTime(value);
      else mapped[field] = cleanString(value) as never;
    });
    return {
      rowNumber: mapped.rowNumber || index + 2,
      region: mapped.region || "",
      clientName: mapped.clientName || "",
      siteName: mapped.siteName || "",
      siteAddress: mapped.siteAddress || "",
      jobDay: mapped.jobDay || "",
      startDate: mapped.startDate || "",
      endDate: mapped.endDate || "",
      startTime: mapped.startTime || "07:00",
      endTime: mapped.endTime || "",
      frequency: mapped.frequency || "Weekly",
      staffRequired: mapped.staffRequired || 2,
      rosteredStaff: mapped.rosteredStaff || [],
      washAsset: mapped.washAsset || "",
      jobTitle: mapped.jobTitle || "Scheduled wash",
      notes: mapped.notes || "",
      active: mapped.active !== false
    };
  }).filter((row) => row.region || row.clientName || row.siteName);
}

async function readLookups(regionNames: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");
  const [regionsResult, staffResult, staffRegionResult, sitesResult, schedulesResult] = await Promise.all([
    supabase.from("regions").select("id,name").eq("is_active", true),
    supabase.from("staff_profiles").select("id,display_name,availability_sheet_name,induction_sheet_name,primary_region_id,status"),
    supabase.from("staff_profile_regions").select("staff_profile_id,region_id"),
    supabase.from("operation_sites").select("id,client_name,site_name,region_id"),
    supabase.from("site_schedules").select("id,site_id,region_id,schedule_name,start_date,job_time,recurrence,job_title")
  ]);
  const firstError = regionsResult.error || staffResult.error || staffRegionResult.error || sitesResult.error || schedulesResult.error;
  if (firstError) throw firstError;

  const regions = (regionsResult.data || []) as RegionRow[];
  const regionByName = new Map(regions.map((region) => [cleanKey(region.name), region]));
  const regionIdToName = new Map(regions.map((region) => [region.id, region.name]));
  const requestedRegionIds = new Set(regionNames.map((name) => regionByName.get(cleanKey(name))?.id).filter(Boolean) as string[]);
  const staffRows = (staffResult.data || []) as StaffRow[];
  const staffRegions = (staffRegionResult.data || []) as StaffRegionRow[];
  const staffByRegion = new Map<string, Map<string, StaffRow>>();

  staffRows.forEach((staff) => {
    const linkedRegionIds = new Set([
      staff.primary_region_id,
      ...staffRegions.filter((link) => link.staff_profile_id === staff.id).map((link) => link.region_id)
    ].filter(Boolean) as string[]);
    linkedRegionIds.forEach((regionId) => {
      if (requestedRegionIds.size && !requestedRegionIds.has(regionId)) return;
      const map = staffByRegion.get(regionId) || new Map<string, StaffRow>();
      [staff.display_name, staff.availability_sheet_name, staff.induction_sheet_name].filter(Boolean).forEach((name) => map.set(cleanKey(name), staff));
      staffByRegion.set(regionId, map);
    });
  });

  const sites = (sitesResult.data || []) as OperationSiteRow[];
  const schedules = (schedulesResult.data || []) as Array<{ id: string; site_id: string; region_id: string | null; schedule_name: string; start_date: string; job_time: string; recurrence: string; job_title: string }>;
  return { regionByName, regionIdToName, staffByRegion, sites, schedules };
}

async function buildPreview(rows: ImportRow[], allowedScope: string, userHasNationalAccess: boolean) {
  const regionNames = Array.from(new Set(rows.map((row) => row.region).filter(Boolean)));
  const lookups = await readLookups(regionNames);
  return rows.map((row): PreviewRow => {
    const messages: string[] = [];
    const region = lookups.regionByName.get(cleanKey(row.region));
    if (!row.region) messages.push("Region is required.");
    if (row.region && !region) messages.push(`Region "${row.region}" is not mapped in TOC.`);
    if (region && !userHasNationalAccess && cleanKey(row.region) !== cleanKey(allowedScope)) messages.push(`You can only import rows for ${allowedScope}.`);
    if (!row.clientName) messages.push("Client Name is required.");
    if (!row.siteName) messages.push("Site Name is required.");

    const resolvedStartDate = row.startDate || nextDateForDay(row.jobDay);
    if (!resolvedStartDate) messages.push("Start Date or Job Day is required.");
    if (!row.startTime) messages.push("Start Time is required.");

    const staffMap = region ? lookups.staffByRegion.get(region.id) : undefined;
    const matchedStaff = row.rosteredStaff
      .map((name) => ({ name, staff: staffMap?.get(cleanKey(name)) }))
      .filter((item): item is { name: string; staff: StaffRow } => Boolean(item.staff))
      .map((item) => ({ name: item.name, id: item.staff.id }));
    const unmatchedStaff = row.rosteredStaff.filter((name) => !staffMap?.get(cleanKey(name)));
    if (unmatchedStaff.length) messages.push(`Unmatched staff: ${unmatchedStaff.join(", ")}.`);

    const { recurrence, recurrenceIntervalWeeks } = normaliseFrequency(row.frequency);
    const site = region ? lookups.sites.find((item) => item.region_id === region.id && cleanKey(item.client_name) === cleanKey(row.clientName) && cleanKey(item.site_name) === cleanKey(row.siteName)) : null;
    const duplicate = site ? lookups.schedules.find((schedule) =>
      schedule.region_id === region?.id &&
      schedule.site_id === site.id &&
      timeKey(schedule.job_time) === timeKey(row.startTime) &&
      cleanKey(schedule.recurrence) === cleanKey(recurrence) &&
      cleanKey(schedule.job_title) === cleanKey(row.jobTitle)
    ) : null;
    const duplicateHint = duplicate ? "Existing matching schedule will be updated." : "New site/schedule will be created if imported.";
    const status = messages.length ? "error" : duplicate ? "warning" : "valid";

    return {
      ...row,
      status,
      messages,
      matchedStaff,
      unmatchedStaff,
      recurrence,
      recurrenceIntervalWeeks,
      resolvedStartDate,
      duplicateHint
    };
  });
}

async function generateScheduleJobs(scheduleId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");
  const { data, error } = await supabase
    .from("site_schedules")
    .select("id,site_id,region_id,schedule_name,start_date,end_date,job_time,recurrence,recurrence_interval_weeks,required_crew_count,job_title,notes,status,wash_asset,site:operation_sites(client_name,site_name,region:regions(name))")
    .eq("id", scheduleId)
    .maybeSingle();
  if (error) throw error;
  const schedule = data as SiteScheduleRow | null;
  const site = firstRelated(schedule?.site);
  const siteRegion = firstRelated(site?.region);
  if (!schedule || !site || schedule.status !== "active") return { created: 0, updated: 0 };

  const { data: staffLinks } = await supabase.from("site_schedule_staff").select("staff_profile_id").eq("site_schedule_id", schedule.id);
  const staffIds = ((staffLinks || []) as Array<{ staff_profile_id: string }>).map((link) => link.staff_profile_id);
  const { data: staffRows } = staffIds.length ? await supabase.from("staff_profiles").select("display_name").in("id", staffIds) : { data: [] };
  const crew = ((staffRows || []) as Array<{ display_name: string }>).map((staff) => staff.display_name).join(", ") || "Unassigned crew";
  const regionName = siteRegion?.name || "National";
  const stepDays = recurrenceStepDays(schedule.recurrence, schedule.recurrence_interval_weeks || 1);
  const today = dateOnly(new Date());
  const startDate = schedule.start_date < today ? today : schedule.start_date;
  const dates = Array.from({ length: stepDays ? 12 : 1 }, (_, index) => stepDays ? addDays(startDate, stepDays * index) : startDate)
    .filter((jobDate) => !schedule.end_date || jobDate <= schedule.end_date);
  const { data: existing } = dates.length
    ? await supabase.from("calendar_jobs").select("id,job_date").eq("source_schedule_id", schedule.id).in("job_date", dates)
    : { data: [] };
  const existingRows = (existing || []) as Array<{ id: string; job_date: string }>;
  const existingDates = new Set(existingRows.map((row) => row.job_date));
  const existingIds = existingRows.map((row) => row.id);
  const notes = [schedule.notes, schedule.wash_asset ? `Asset: ${schedule.wash_asset}` : ""].filter(Boolean).join("\n");

  if (existingIds.length) {
    const { error: updateError } = await supabase.from("calendar_jobs").update({
      location: regionName,
      site: `${site.client_name} - ${site.site_name}`,
      crew,
      job_title: schedule.job_title || "Scheduled wash",
      notes,
      recurrence: schedule.recurrence,
      recurrence_detail: schedule.schedule_name || null,
      recurrence_interval_weeks: schedule.recurrence === "Custom" ? schedule.recurrence_interval_weeks : null,
      site_id: schedule.site_id,
      required_crew_count: schedule.required_crew_count,
      updated_at: new Date().toISOString()
    }).in("id", existingIds);
    if (updateError) throw updateError;
    await supabase.from("calendar_job_staff").delete().in("calendar_job_id", existingIds);
    if (staffIds.length) {
      const staffAssignments = existingIds.flatMap((jobId) => staffIds.map((staffId) => ({ calendar_job_id: jobId, staff_profile_id: staffId })));
      const { error: assignmentError } = await supabase.from("calendar_job_staff").insert(staffAssignments);
      if (assignmentError) throw assignmentError;
    }
  }

  const newRows = dates.filter((jobDate) => !existingDates.has(jobDate)).map((jobDate) => ({
    job_date: jobDate,
    job_time: schedule.job_time?.slice(0, 5) || "07:00",
    location: regionName,
    site: `${site.client_name} - ${site.site_name}`,
    crew,
    job_title: schedule.job_title || "Scheduled wash",
    status: "Scheduled",
    notes,
    severity: "green",
    recurrence: schedule.recurrence,
    recurrence_detail: schedule.schedule_name || null,
    recurrence_interval_weeks: schedule.recurrence === "Custom" ? schedule.recurrence_interval_weeks : null,
    site_id: schedule.site_id,
    required_crew_count: schedule.required_crew_count,
    source_schedule_id: schedule.id
  }));
  if (!newRows.length) return { created: 0, updated: existingIds.length };
  const { data: inserted, error: insertError } = await supabase.from("calendar_jobs").insert(newRows).select("id");
  if (insertError) throw insertError;
  const insertedIds = ((inserted || []) as Array<{ id: string }>).map((row) => row.id);
  if (insertedIds.length && staffIds.length) {
    const staffAssignments = insertedIds.flatMap((jobId) => staffIds.map((staffId) => ({ calendar_job_id: jobId, staff_profile_id: staffId })));
    const { error: assignmentError } = await supabase.from("calendar_job_staff").insert(staffAssignments);
    if (assignmentError) throw assignmentError;
  }
  await supabase.from("site_schedules").update({ last_generated_until: newRows[newRows.length - 1].job_date, updated_at: new Date().toISOString() }).eq("id", schedule.id);
  return { created: newRows.length, updated: existingIds.length };
}

async function importRows(rows: PreviewRow[], actor: TocAuthenticatedUser) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");
  const validRows = rows.filter((row) => row.status !== "error" && row.active);
  const lookups = await readLookups(Array.from(new Set(validRows.map((row) => row.region))));
  const imported: Array<{ rowNumber: number; siteId: string; scheduleId: string; calendarJobsCreated: number; calendarJobsUpdated: number }> = [];

  for (const row of validRows) {
    const region = lookups.regionByName.get(cleanKey(row.region));
    if (!region) continue;
    let site = lookups.sites.find((item) => item.region_id === region.id && cleanKey(item.client_name) === cleanKey(row.clientName) && cleanKey(item.site_name) === cleanKey(row.siteName));
    const siteRow = {
      client_name: row.clientName,
      site_name: row.siteName,
      region_id: region.id,
      address: row.siteAddress,
      required_induction: true,
      required_crew_count: row.staffRequired || 2,
      status: "active",
      updated_at: new Date().toISOString()
    };

    if (site) {
      const { error } = await supabase.from("operation_sites").update(siteRow).eq("id", site.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("operation_sites").insert({ ...siteRow, notes: "" }).select("id,client_name,site_name,region_id").single();
      if (error) throw error;
      site = data as OperationSiteRow;
      lookups.sites.push(site);
    }

    const scheduleName = `${row.clientName} - ${row.siteName} ${row.startTime}`;
    const notes = [row.notes, row.endTime ? `End time: ${row.endTime}` : ""].filter(Boolean).join("\n");
    const existingSchedule = lookups.schedules.find((schedule) =>
      schedule.region_id === region.id &&
      schedule.site_id === site!.id &&
      timeKey(schedule.job_time) === timeKey(row.startTime) &&
      cleanKey(schedule.recurrence) === cleanKey(row.recurrence) &&
      cleanKey(schedule.job_title) === cleanKey(row.jobTitle)
    );
    const schedulePayload = {
      site_id: site.id,
      region_id: region.id,
      schedule_name: scheduleName,
      start_date: row.resolvedStartDate,
      end_date: row.endDate || null,
      job_time: row.startTime || "07:00",
      recurrence: row.recurrence,
      recurrence_interval_weeks: row.recurrenceIntervalWeeks,
      required_crew_count: row.staffRequired || 2,
      job_title: row.jobTitle || "Scheduled wash",
      wash_asset: row.washAsset,
      notes,
      status: row.active ? "active" : "inactive",
      updated_at: new Date().toISOString()
    };
    const scheduleResult = existingSchedule
      ? await supabase.from("site_schedules").update(schedulePayload).eq("id", existingSchedule.id).select("id").maybeSingle()
      : await supabase.from("site_schedules").insert(schedulePayload).select("id").single();
    if (scheduleResult.error) throw scheduleResult.error;
    if (!scheduleResult.data) throw new Error(`Row ${row.rowNumber} schedule could not be saved.`);
    const scheduleId = scheduleResult.data.id;
    if (!existingSchedule) lookups.schedules.push({ id: scheduleId, site_id: site.id, region_id: region.id, schedule_name: scheduleName, start_date: row.resolvedStartDate, job_time: row.startTime, recurrence: row.recurrence, job_title: row.jobTitle });

    await supabase.from("site_schedule_staff").delete().eq("site_schedule_id", scheduleId);
    if (row.matchedStaff.length) {
      const { error } = await supabase.from("site_schedule_staff").insert(row.matchedStaff.map((staff) => ({ site_schedule_id: scheduleId, staff_profile_id: staff.id })));
      if (error) throw error;
    }
    const generation = await generateScheduleJobs(scheduleId);
    imported.push({ rowNumber: row.rowNumber, siteId: site.id, scheduleId, calendarJobsCreated: generation.created, calendarJobsUpdated: generation.updated });
  }

  if (imported.length) {
    await logTocAudit({
      actor,
      action: "operations_setup.roster_import",
      entityTable: "site_schedules",
      entityId: imported[0].scheduleId,
      scope: Array.from(new Set(validRows.map((row) => row.region))).join(", "),
      details: { importedCount: imported.length, rows: imported }
    });
  }

  return imported;
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Upload form data is required." }, { status: 400 });
  const file = formData.get("file");
  const requestedRegion = cleanString(formData.get("region")) || "Brisbane";
  const mode = cleanKey(formData.get("mode")) === "import" ? "import" : "preview";
  const permission = await requireTocScope(request, requestedRegion);
  if (permission.error) return permission.error;
  if (!(file instanceof File)) return NextResponse.json({ error: "Roster import file is required." }, { status: 400 });
  if (!file.name.match(/\.csv$/i)) return NextResponse.json({ error: "Upload the TOC roster template as a CSV file. Open it in Excel to edit, then save as CSV before upload." }, { status: 400 });

  try {
    const rows = parseWorkbook(await file.text());
    const scopedRows = rows.map((row) => ({ ...row, region: row.region || permission.scope }));
    const userHasNationalAccess = hasNationalAccess(permission.user);
    if (!userHasNationalAccess && !scopedRows.every((row) => canAccessScope(permission.user, row.region))) {
      return NextResponse.json({ error: "This file contains rows outside your TOC region access." }, { status: 403 });
    }
    const previewRows = await buildPreview(scopedRows, permission.scope, userHasNationalAccess);
    const summary = {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.status === "valid").length,
      warningRows: previewRows.filter((row) => row.status === "warning").length,
      errorRows: previewRows.filter((row) => row.status === "error").length
    };

    if (mode === "preview") {
      return NextResponse.json({ connected: true, mode, summary, rows: previewRows });
    }
    if (summary.errorRows) {
      return NextResponse.json({ connected: false, mode, summary, rows: previewRows, error: "Fix import errors before confirming the roster import." }, { status: 400 });
    }
    const imported = await importRows(previewRows, permission.user);
    return NextResponse.json({ connected: true, mode, summary, imported, rows: previewRows });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Roster import failed." }, { status: 500 });
  }
}
