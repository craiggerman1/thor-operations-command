import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { canAccessScope, hasNationalAccess, requireTocRole, requireTocScope, requireTocUser } from "@/lib/toc-auth";
import { normaliseSheetSourceConfig } from "@/lib/sheet-source-settings";

type RegionRow = { id: string; name: string };
type Related<T> = T | T[] | null | undefined;
type StaffRow = {
  id: string;
  display_name: string;
  role: string;
  status: string;
  primary_region_id: string | null;
  skills: string[] | null;
  contact_mobile: string | null;
  contact_whatsapp: string | null;
  availability_sheet_name: string | null;
  induction_sheet_name: string | null;
  reliability_notes: string | null;
};
type StaffRegionRow = { staff_profile_id: string; region_id: string };
type SiteRow = {
  id: string;
  client_name: string;
  site_name: string;
  region_id: string | null;
  address: string;
  required_induction: boolean;
  required_crew_count: number;
  notes: string;
  status: string;
  region?: Related<{ name: string }>;
};
type ScheduleRow = {
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
  site?: Related<{ client_name: string; site_name: string; region?: Related<{ name: string }> }>;
};
type ScheduleStaffRow = { site_schedule_id: string; staff_profile_id: string };
type ExistingCalendarJobRow = { id: string; job_date: string };
type InductionRow = {
  id: string;
  staff_profile_id: string | null;
  site_id: string | null;
  staff_name: string;
  site_name: string;
  status: string;
  expiry: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedSkills = ["Wash Hand", "Driver", "Team Leader"];
const allowedRecurrences = ["None", "Daily", "Weekly", "Fortnightly", "4 weekly", "Custom"];

function firstRelated<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function cleanArray(value: unknown) {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function cleanSkills(value: unknown) {
  const selected = cleanArray(value);
  return allowedSkills.filter((skill) => selected.includes(skill));
}

function isUuid(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value);
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function settingKey(slug: string, region: string) {
  return `sheet_source_settings_${slug}_${region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function recurrenceStepDays(recurrence: string, intervalWeeks: number) {
  if (recurrence === "Daily") return 1;
  if (recurrence === "Weekly") return 7;
  if (recurrence === "Fortnightly") return 14;
  if (recurrence === "4 weekly") return 28;
  if (recurrence === "Custom") return intervalWeeks * 7;
  return null;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateOnly(date);
}

async function regionLookup() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();
  const { data, error } = await supabase.from("regions").select("id,name").eq("is_active", true);
  if (error) throw error;
  return new Map(((data || []) as RegionRow[]).map((region) => [region.name, region.id]));
}

async function regionNameLookup() {
  const lookup = await regionLookup();
  return new Map(Array.from(lookup.entries()).map(([name, id]) => [id, name]));
}

async function resolveRegion(regionName: string) {
  const lookup = await regionLookup();
  return lookup.get(regionName) || null;
}

async function assertRegionAccess(request: Request, regionName: string) {
  const permission = await requireTocScope(request, regionName);
  if (permission.error) return permission;
  return permission;
}

async function saveStaffRegions(staffId: string, regionIds: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");
  await supabase.from("staff_profile_regions").delete().eq("staff_profile_id", staffId);
  const rows = Array.from(new Set(regionIds)).map((regionId) => ({ staff_profile_id: staffId, region_id: regionId }));
  if (rows.length) {
    const { error } = await supabase.from("staff_profile_regions").insert(rows);
    if (error) throw error;
  }
}

async function ensureSiteBelongsToRegion(siteId: string, regionId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");
  const { data, error } = await supabase.from("operation_sites").select("id,region_id").eq("id", siteId).maybeSingle();
  if (error) throw error;
  if (!data || (data as { region_id: string | null }).region_id !== regionId) throw new Error("Selected client/site is not mapped to this region.");
}

async function ensureScheduleBelongsToRegion(scheduleId: string, regionId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");
  const { data, error } = await supabase.from("site_schedules").select("id,region_id").eq("id", scheduleId).maybeSingle();
  if (error) throw error;
  if (!data || (data as { region_id: string | null }).region_id !== regionId) throw new Error("Selected schedule is not mapped to this region.");
}

async function ensureStaffBelongToRegion(staffIds: string[], regionId: string) {
  if (!staffIds.length) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");
  const [profilesResult, linksResult] = await Promise.all([
    supabase.from("staff_profiles").select("id,primary_region_id").in("id", staffIds),
    supabase.from("staff_profile_regions").select("staff_profile_id,region_id").in("staff_profile_id", staffIds)
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (linksResult.error) throw linksResult.error;
  const profileRows = (profilesResult.data || []) as Array<{ id: string; primary_region_id: string | null }>;
  const linkRows = (linksResult.data || []) as StaffRegionRow[];
  const validIds = new Set<string>();
  profileRows.forEach((profile) => {
    if (profile.primary_region_id === regionId || linkRows.some((link) => link.staff_profile_id === profile.id && link.region_id === regionId)) validIds.add(profile.id);
  });
  const invalidIds = staffIds.filter((staffId) => !validIds.has(staffId));
  if (invalidIds.length) throw new Error("One or more selected staff are not mapped to this region.");
}

async function readSetup(regionName: string, profileId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { connected: false, error: "Supabase server key is not configured." };
  const regionId = await resolveRegion(regionName);
  if (!regionId) return { connected: false, error: "Region is not mapped in TOC.", region: regionName };
  const regionNames = await regionNameLookup();

  await supabase
    .from("operations_setup_status")
    .upsert({ profile_id: profileId, region_id: regionId, last_opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "profile_id,region_id" });

  const [statusResult, staffResult, linkResult, sitesResult, schedulesResult, scheduleStaffResult, inductionsResult, availabilitySourceResult, inductionSourceResult] = await Promise.all([
    supabase.from("operations_setup_status").select("current_step,completed_at,force_run_next_login,last_opened_at").eq("profile_id", profileId).eq("region_id", regionId).maybeSingle(),
    supabase.from("staff_profiles").select("id,display_name,role,status,primary_region_id,skills,contact_mobile,contact_whatsapp,availability_sheet_name,induction_sheet_name,reliability_notes").order("display_name", { ascending: true }),
    supabase.from("staff_profile_regions").select("staff_profile_id,region_id"),
    supabase.from("operation_sites").select("id,client_name,site_name,region_id,address,required_induction,required_crew_count,notes,status,region:regions(name)").eq("region_id", regionId).order("client_name", { ascending: true }),
    supabase.from("site_schedules").select("id,site_id,region_id,schedule_name,start_date,end_date,job_time,recurrence,recurrence_interval_weeks,required_crew_count,job_title,notes,status,wash_asset,site:operation_sites(client_name,site_name)").eq("region_id", regionId).order("start_date", { ascending: true }),
    supabase.from("site_schedule_staff").select("site_schedule_id,staff_profile_id"),
    supabase.from("staff_induction_cache").select("id,staff_profile_id,site_id,staff_name,site_name,status,expiry").eq("region_id", regionId).order("staff_name", { ascending: true }),
    supabase.from("app_settings").select("value").eq("key", settingKey("staff-availability", regionName)).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", settingKey("inductions", regionName)).maybeSingle()
  ]);

  const firstError = statusResult.error || staffResult.error || linkResult.error || sitesResult.error || schedulesResult.error || scheduleStaffResult.error || inductionsResult.error || availabilitySourceResult.error || inductionSourceResult.error;
  if (firstError) return { connected: false, error: firstError.message, region: regionName };

  const regionStaffLinks = ((linkResult.data || []) as StaffRegionRow[]).filter((link) => link.region_id === regionId);
  const staffLinks = (linkResult.data || []) as StaffRegionRow[];
  const regionStaffIds = new Set(regionStaffLinks.map((link) => link.staff_profile_id));
  const staff = ((staffResult.data || []) as StaffRow[])
    .filter((staffRow) => staffRow.primary_region_id === regionId || regionStaffIds.has(staffRow.id))
    .map((staffRow) => {
      const linkedRegions = staffLinks
        .filter((link) => link.staff_profile_id === staffRow.id)
        .map((link) => regionNames.get(link.region_id))
        .filter(Boolean) as string[];
      const primaryRegion = staffRow.primary_region_id ? regionNames.get(staffRow.primary_region_id) : "";
      const regions = Array.from(new Set([primaryRegion, ...linkedRegions, regionName].filter(Boolean)));
      return ({
      id: staffRow.id,
      name: staffRow.display_name,
      role: staffRow.role || "Wash Hand",
      status: staffRow.status || "active",
      skills: staffRow.skills || [],
      mobile: staffRow.contact_mobile || "",
      whatsapp: staffRow.contact_whatsapp || "",
      availabilitySheetName: staffRow.availability_sheet_name || staffRow.display_name,
      inductionSheetName: staffRow.induction_sheet_name || staffRow.display_name,
      notes: staffRow.reliability_notes || "",
      regions
    });
    });
  const scheduleStaff = (scheduleStaffResult.data || []) as ScheduleStaffRow[];

  return {
    connected: true,
    region: regionName,
    setup: statusResult.data || { current_step: 1, completed_at: null, force_run_next_login: false },
    availabilitySource: availabilitySourceResult.data?.value || null,
    inductionSource: inductionSourceResult.data?.value || null,
    staff,
    sites: ((sitesResult.data || []) as SiteRow[]).map((site) => ({
      id: site.id,
      clientName: site.client_name,
      siteName: site.site_name,
      address: site.address || "",
      requiredInduction: site.required_induction,
      requiredCrewCount: site.required_crew_count,
      notes: site.notes || "",
      status: site.status,
      regions: [regionNames.get(site.region_id || "") || regionName]
    })),
    schedules: ((schedulesResult.data || []) as ScheduleRow[]).map((schedule) => ({
      id: schedule.id,
      siteId: schedule.site_id,
      siteLabel: firstRelated(schedule.site) ? `${firstRelated(schedule.site)?.client_name} - ${firstRelated(schedule.site)?.site_name}` : "Unassigned site",
      scheduleName: schedule.schedule_name || "",
      startDate: schedule.start_date,
      endDate: schedule.end_date || "",
      jobTime: schedule.job_time?.slice(0, 5) || "07:00",
      recurrence: schedule.recurrence,
      recurrenceIntervalWeeks: schedule.recurrence_interval_weeks,
      requiredCrewCount: schedule.required_crew_count,
      jobTitle: schedule.job_title,
      washAsset: schedule.wash_asset || "",
      notes: schedule.notes || "",
      status: schedule.status,
      regions: [regionNames.get(schedule.region_id || "") || regionName],
      staffIds: scheduleStaff.filter((link) => link.site_schedule_id === schedule.id).map((link) => link.staff_profile_id)
    })),
    inductions: ((inductionsResult.data || []) as InductionRow[]).map((induction) => ({
      id: induction.id,
      staffId: induction.staff_profile_id || "",
      siteId: induction.site_id || "",
      staffName: induction.staff_name,
      siteName: induction.site_name,
      status: induction.status || "",
      expiry: induction.expiry || ""
    }))
  };
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
  const schedule = data as ScheduleRow | null;
  const site = firstRelated(schedule?.site);
  if (!schedule || !site || schedule.status !== "active") return { created: 0 };

  const { data: staffLinks } = await supabase.from("site_schedule_staff").select("staff_profile_id").eq("site_schedule_id", schedule.id);
  const staffIds = ((staffLinks || []) as Array<{ staff_profile_id: string }>).map((link) => link.staff_profile_id);
  const { data: staffRows } = staffIds.length
    ? await supabase.from("staff_profiles").select("display_name").in("id", staffIds)
    : { data: [] };
  const crew = ((staffRows || []) as Array<{ display_name: string }>).map((staff) => staff.display_name).join(", ") || "Unassigned crew";
  const regionName = firstRelated(site.region)?.name || "National";
  const stepDays = recurrenceStepDays(schedule.recurrence, schedule.recurrence_interval_weeks || 1);
  const startDate = schedule.start_date < dateOnly(new Date()) ? dateOnly(new Date()) : schedule.start_date;
  const dates = Array.from({ length: stepDays ? 12 : 1 }, (_, index) => stepDays ? addDays(startDate, index * stepDays) : startDate)
    .filter((jobDate) => !schedule.end_date || jobDate <= schedule.end_date);
  const { data: existing } = await supabase.from("calendar_jobs").select("id,job_date").eq("source_schedule_id", schedule.id).in("job_date", dates);
  const existingRows = (existing || []) as ExistingCalendarJobRow[];
  const existingDates = new Set(existingRows.map((row) => row.job_date));
  const existingIds = existingRows.map((row) => row.id);
  if (existingIds.length) {
    const { error: updateError } = await supabase.from("calendar_jobs").update({
      location: regionName,
      site: `${site.client_name} - ${site.site_name}`,
      crew,
      job_title: schedule.job_title || "Scheduled wash",
      notes: [schedule.notes, schedule.wash_asset ? `Asset: ${schedule.wash_asset}` : ""].filter(Boolean).join("\n"),
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
  const rows = dates.filter((jobDate) => !existingDates.has(jobDate)).map((jobDate) => ({
    job_date: jobDate,
    job_time: schedule.job_time?.slice(0, 5) || "07:00",
    location: regionName,
    site: `${site.client_name} - ${site.site_name}`,
    crew,
    job_title: schedule.job_title || "Scheduled wash",
    status: "Scheduled",
    notes: [schedule.notes, schedule.wash_asset ? `Asset: ${schedule.wash_asset}` : ""].filter(Boolean).join("\n"),
    severity: "green",
    recurrence: schedule.recurrence,
    recurrence_detail: schedule.schedule_name || null,
    recurrence_interval_weeks: schedule.recurrence === "Custom" ? schedule.recurrence_interval_weeks : null,
    site_id: schedule.site_id,
    required_crew_count: schedule.required_crew_count,
    source_schedule_id: schedule.id
  }));
  if (!rows.length) return { created: 0 };
  const { data: insertedRows, error: insertError } = await supabase.from("calendar_jobs").insert(rows).select("id");
  if (insertError) throw insertError;
  const insertedIds = ((insertedRows || []) as Array<{ id: string }>).map((row) => row.id);
  if (insertedIds.length && staffIds.length) {
    const staffAssignments = insertedIds.flatMap((jobId) => staffIds.map((staffId) => ({ calendar_job_id: jobId, staff_profile_id: staffId })));
    const { error: assignmentError } = await supabase.from("calendar_job_staff").insert(staffAssignments);
    if (assignmentError) throw assignmentError;
  }
  await supabase.from("site_schedules").update({ last_generated_until: rows[rows.length - 1].job_date, updated_at: new Date().toISOString() }).eq("id", schedule.id);
  return { created: rows.length };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const region = url.searchParams.get("region") || undefined;
  const permission = await assertRegionAccess(request, region || "");
  if (permission.error) return permission.error;
  const result = await readSetup(permission.scope, permission.user.id);
  return NextResponse.json(result, { status: result.connected ? 200 : 503 });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const action = cleanString(payload.action);
  const regionName = cleanString(payload.region);

  if (action === "forceForUser") {
    const permission = await requireTocRole(request, ["admin"]);
    if (permission.error) return permission.error;
    const supabase = getSupabaseAdminClient();
    if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
    if (!isUuid(payload.profileId)) return NextResponse.json({ error: "Profile id is required." }, { status: 400 });
    const regionId = await resolveRegion(regionName || "Brisbane");
    if (!regionId) return NextResponse.json({ error: "Region is not mapped in TOC." }, { status: 400 });
    const { error } = await supabase.from("operations_setup_status").upsert({
      profile_id: payload.profileId,
      region_id: regionId,
      current_step: 1,
      force_run_next_login: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "profile_id,region_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logTocAudit({ actor: permission.user, action: "admin.operations_setup.force_next_login", entityTable: "operations_setup_status", entityId: payload.profileId, scope: regionName });
    return NextResponse.json({ connected: true, forced: true });
  }

  const permission = regionName ? await assertRegionAccess(request, regionName) : await requireTocUser(request);
  if (permission.error) return permission.error;
  const user = permission.user;
  const scope = regionName || ("scope" in permission && typeof permission.scope === "string" ? permission.scope : "");
  if (!scope) return NextResponse.json({ error: "Region is required for setup changes." }, { status: 400 });
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  const regionId = await resolveRegion(scope);
  if (!regionId || !canAccessScope(user, scope)) return NextResponse.json({ error: "You do not have permission to manage this region setup." }, { status: 403 });

  try {
    if (action === "upsertStaff") {
      const name = cleanString(payload.name);
      if (!name) return NextResponse.json({ error: "Staff name is required." }, { status: 400 });
      if (isUuid(payload.id) && !hasNationalAccess(user)) await ensureStaffBelongToRegion([payload.id], regionId);
      const row = {
        display_name: name,
        preferred_name: cleanString(payload.preferredName) || null,
        role: cleanString(payload.role) || "Wash Hand",
        status: cleanString(payload.status) || "active",
        primary_region_id: regionId,
        skills: cleanSkills(payload.skills),
        contact_mobile: cleanString(payload.mobile) || null,
        contact_whatsapp: cleanString(payload.whatsapp) || null,
        availability_sheet_name: cleanString(payload.availabilitySheetName || name),
        induction_sheet_name: cleanString(payload.inductionSheetName || name),
        reliability_notes: cleanString(payload.notes),
        contact_visible_to_odin: true,
        updated_at: new Date().toISOString()
      };
      const query = isUuid(payload.id)
        ? supabase.from("staff_profiles").update(row).eq("id", payload.id).select("id").maybeSingle()
        : supabase.from("staff_profiles").insert(row).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Staff record was not found." }, { status: 404 });
      await saveStaffRegions(data.id, [regionId]);
      await logTocAudit({ actor: user, action: isUuid(payload.id) ? "operations_setup.staff.update" : "operations_setup.staff.create", entityTable: "staff_profiles", entityId: data.id, scope });
      return NextResponse.json(await readSetup(scope, user.id));
    }

    if (action === "removeStaffFromRegion") {
      if (!isUuid(payload.id)) return NextResponse.json({ error: "Staff id is required." }, { status: 400 });
      if (!hasNationalAccess(user)) await ensureStaffBelongToRegion([payload.id], regionId);
      const { data: profile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("id,display_name,primary_region_id")
        .eq("id", payload.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return NextResponse.json({ error: "Staff record was not found." }, { status: 404 });

      const { error: regionDeleteError } = await supabase
        .from("staff_profile_regions")
        .delete()
        .eq("staff_profile_id", payload.id)
        .eq("region_id", regionId);
      if (regionDeleteError) throw regionDeleteError;

      const { data: remainingRegions, error: remainingError } = await supabase
        .from("staff_profile_regions")
        .select("region_id")
        .eq("staff_profile_id", payload.id);
      if (remainingError) throw remainingError;
      const remainingRegionIds = ((remainingRegions || []) as Array<{ region_id: string }>).map((row) => row.region_id);
      const profileRow = profile as { id: string; display_name: string; primary_region_id: string | null };
      if (profileRow.primary_region_id === regionId || (!profileRow.primary_region_id && !remainingRegionIds.length)) {
        const nextPrimaryRegionId = remainingRegionIds[0] || null;
        const { error: profileUpdateError } = await supabase
          .from("staff_profiles")
          .update({
            primary_region_id: nextPrimaryRegionId,
            status: nextPrimaryRegionId ? "active" : "inactive",
            updated_at: new Date().toISOString()
          })
          .eq("id", payload.id);
        if (profileUpdateError) throw profileUpdateError;
      }

      const { data: regionSchedules, error: schedulesError } = await supabase
        .from("site_schedules")
        .select("id")
        .eq("region_id", regionId);
      if (schedulesError) throw schedulesError;
      const scheduleIds = ((regionSchedules || []) as Array<{ id: string }>).map((row) => row.id);
      if (scheduleIds.length) {
        const { error: scheduleStaffError } = await supabase
          .from("site_schedule_staff")
          .delete()
          .eq("staff_profile_id", payload.id)
          .in("site_schedule_id", scheduleIds);
        if (scheduleStaffError) throw scheduleStaffError;

        const { data: futureJobs, error: jobsError } = await supabase
          .from("calendar_jobs")
          .select("id")
          .in("source_schedule_id", scheduleIds)
          .gte("job_date", dateOnly(new Date()));
        if (jobsError) throw jobsError;
        const futureJobIds = ((futureJobs || []) as Array<{ id: string }>).map((row) => row.id);
        if (futureJobIds.length) {
          const { error: calendarStaffError } = await supabase
            .from("calendar_job_staff")
            .delete()
            .eq("staff_profile_id", payload.id)
            .in("calendar_job_id", futureJobIds);
          if (calendarStaffError) throw calendarStaffError;
        }
      }

      await logTocAudit({
        actor: user,
        action: "operations_setup.staff.remove_from_region",
        entityTable: "staff_profiles",
        entityId: payload.id,
        scope,
        details: { staffName: profileRow.display_name, remainingRegionCount: remainingRegionIds.length }
      });
      return NextResponse.json(await readSetup(scope, user.id));
    }

    if (action === "upsertSite") {
      const clientName = cleanString(payload.clientName);
      const siteName = cleanString(payload.siteName);
      if (!clientName || !siteName) return NextResponse.json({ error: "Client and site name are required." }, { status: 400 });
      if (isUuid(payload.id) && !hasNationalAccess(user)) await ensureSiteBelongsToRegion(payload.id, regionId);
      const row = {
        client_name: clientName,
        site_name: siteName,
        region_id: regionId,
        address: cleanString(payload.address),
        required_induction: payload.requiredInduction !== false,
        required_crew_count: cleanNumber(payload.requiredCrewCount, 2, 0, 20),
        notes: cleanString(payload.notes),
        status: cleanString(payload.status) || "active",
        updated_at: new Date().toISOString()
      };
      const query = isUuid(payload.id)
        ? supabase.from("operation_sites").update(row).eq("id", payload.id).select("id").maybeSingle()
        : supabase.from("operation_sites").insert(row).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Client/site record was not found." }, { status: 404 });
      await logTocAudit({ actor: user, action: isUuid(payload.id) ? "operations_setup.site.update" : "operations_setup.site.create", entityTable: "operation_sites", entityId: data.id, scope });
      return NextResponse.json(await readSetup(scope, user.id));
    }

    if (action === "upsertSchedule") {
      if (!isUuid(payload.siteId)) return NextResponse.json({ error: "Client/site is required." }, { status: 400 });
      if (isUuid(payload.id) && !hasNationalAccess(user)) await ensureScheduleBelongsToRegion(payload.id, regionId);
      await ensureSiteBelongsToRegion(payload.siteId, regionId);
      const staffIds = cleanArray(payload.staffIds).filter(isUuid);
      await ensureStaffBelongToRegion(staffIds, regionId);
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
        wash_asset: cleanString(payload.washAsset),
        notes: cleanString(payload.notes),
        status: cleanString(payload.status) || "active",
        updated_at: new Date().toISOString()
      };
      const query = isUuid(payload.id)
        ? supabase.from("site_schedules").update(row).eq("id", payload.id).select("id").maybeSingle()
        : supabase.from("site_schedules").insert(row).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Schedule record was not found." }, { status: 404 });
      await supabase.from("site_schedule_staff").delete().eq("site_schedule_id", data.id);
      const staffRows = staffIds.map((staffId) => ({ site_schedule_id: data.id, staff_profile_id: staffId }));
      if (staffRows.length) {
        const { error: staffError } = await supabase.from("site_schedule_staff").insert(staffRows);
        if (staffError) throw staffError;
      }
      const generation = payload.generateCalendarJobs ? await generateScheduleJobs(data.id) : null;
      await logTocAudit({ actor: user, action: isUuid(payload.id) ? "operations_setup.schedule.update" : "operations_setup.schedule.create", entityTable: "site_schedules", entityId: data.id, scope, details: { generation } });
      return NextResponse.json({ ...await readSetup(scope, user.id), generation });
    }

    if (action === "upsertInduction") {
      const staffId = isUuid(payload.staffId) ? payload.staffId : null;
      const siteId = isUuid(payload.siteId) ? payload.siteId : null;
      const staffName = cleanString(payload.staffName);
      const siteName = cleanString(payload.siteName);
      if (!staffName || !siteName) return NextResponse.json({ error: "Staff and site are required." }, { status: 400 });
      if (staffId) await ensureStaffBelongToRegion([staffId], regionId);
      if (siteId) await ensureSiteBelongsToRegion(siteId, regionId);
      const row = {
        staff_profile_id: staffId,
        site_id: siteId,
        staff_name: staffName,
        site_name: siteName,
        region_id: regionId,
        source_slug: "manual-setup",
        source_name: `${scope} setup wizard`,
        status: cleanString(payload.status),
        expiry: cleanString(payload.expiry),
        updated_at: new Date().toISOString()
      };
      const query = isUuid(payload.id)
        ? supabase.from("staff_induction_cache").update(row).eq("id", payload.id).select("id").maybeSingle()
        : supabase.from("staff_induction_cache").insert(row).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Induction row was not found." }, { status: 404 });
      await logTocAudit({ actor: user, action: "operations_setup.induction.upsert", entityTable: "staff_induction_cache", entityId: data.id, scope });
      return NextResponse.json(await readSetup(scope, user.id));
    }

    if (action === "saveAvailabilitySource") {
      const config = normaliseSheetSourceConfig("staff-availability", {
        slug: "staff-availability",
        sourceName: cleanString(payload.sourceName) || `${scope} Staff Availability`,
        spreadsheetUrl: cleanString(payload.spreadsheetUrl),
        region: scope,
        statusLabel: cleanString(payload.statusLabel) || "Live Google Sheet",
        connected: Boolean(cleanString(payload.spreadsheetUrl))
      });
      const { error } = await supabase.from("app_settings").upsert({ key: settingKey("staff-availability", scope), value: config, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      await logTocAudit({ actor: user, action: "operations_setup.availability_source.save", entityTable: "app_settings", scope, details: { sourceName: config.sourceName } });
      return NextResponse.json(await readSetup(scope, user.id));
    }

    if (action === "saveInductionSource") {
      const config = normaliseSheetSourceConfig("inductions", {
        slug: "inductions",
        sourceName: cleanString(payload.sourceName) || `${scope} Staff Inductions`,
        spreadsheetUrl: cleanString(payload.spreadsheetUrl),
        region: scope,
        statusLabel: cleanString(payload.statusLabel) || "Live Google Sheet",
        connected: Boolean(cleanString(payload.spreadsheetUrl))
      });
      const { error } = await supabase.from("app_settings").upsert({ key: settingKey("inductions", scope), value: config, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      await logTocAudit({ actor: user, action: "operations_setup.induction_source.save", entityTable: "app_settings", scope, details: { sourceName: config.sourceName } });
      return NextResponse.json(await readSetup(scope, user.id));
    }

    if (action === "completeSetup") {
      const { error } = await supabase.from("operations_setup_status").upsert({
        profile_id: user.id,
        region_id: regionId,
        current_step: 4,
        completed_at: new Date().toISOString(),
        force_run_next_login: false,
        updated_at: new Date().toISOString()
      }, { onConflict: "profile_id,region_id" });
      if (error) throw error;
      await logTocAudit({ actor: user, action: "operations_setup.complete", entityTable: "operations_setup_status", entityId: user.id, scope });
      return NextResponse.json(await readSetup(scope, user.id));
    }

    return NextResponse.json({ error: "Unsupported setup action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Operations setup request failed." }, { status: 500 });
  }
}
