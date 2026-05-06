import { isStaffAvailableForJob, isStaffInductedForSite, readOdinStaffEntities, type OdinStaffEntity } from "@/lib/odin-staff";
import { getSupabaseAdminClient } from "@/lib/supabase";

type CalendarJobRow = {
  id: string;
  job_date: string;
  job_time: string | null;
  location: string | null;
  site: string | null;
  crew: string | null;
  job_title: string | null;
  status: string | null;
  severity: string | null;
};

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function crewLooksUnassigned(crew: string | null) {
  return !crew || /unassigned|tbc|unknown|none/i.test(crew);
}

function parseCrewNames(crew: string | null) {
  if (!crew || crewLooksUnassigned(crew)) return [];
  return crew
    .split(/,|&|\+| and /i)
    .map((name) => name.trim())
    .filter(Boolean);
}

function staffForRegion(staff: OdinStaffEntity[], region: string) {
  return staff.filter((person) => person.status !== "inactive" && person.regions.some((staffRegion) => staffRegion.toLowerCase() === region.toLowerCase()));
}

function staffByName(staff: OdinStaffEntity[], name: string) {
  const cleanName = name.toLowerCase();
  return staff.find((person) => person.name.toLowerCase() === cleanName || person.preferredName?.toLowerCase() === cleanName);
}

async function readRosterJobs() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { jobs: [] as CalendarJobRow[], error: "Supabase server key is not configured." };

  const today = new Date();
  const startDate = dateOnly(today);
  const endDate = dateOnly(addDays(today, 14));
  const { data, error } = await supabase
    .from("calendar_jobs")
    .select("id,job_date,job_time,location,site,crew,job_title,status,severity")
    .gte("job_date", startDate)
    .lte("job_date", endDate)
    .not("status", "in", "(Completed,Cancelled,closed,complete)")
    .order("job_date", { ascending: true })
    .order("job_time", { ascending: true });

  return {
    jobs: (data || []) as CalendarJobRow[],
    error: error?.message || null
  };
}

export async function buildOdinRosterGaps() {
  const [staffResult, jobsResult] = await Promise.all([
    readOdinStaffEntities({ includeProtected: true }),
    readRosterJobs()
  ]);

  const gaps = jobsResult.jobs.flatMap((job) => {
    const region = job.location || "National";
    const site = job.site || "Unassigned site";
    const time = job.job_time || "07:00";
    const regionalStaff = staffForRegion(staffResult.staff, region);
    const availableStaff = regionalStaff.filter((person) => isStaffAvailableForJob(person, job.job_date, time) === true);
    const inductedStaff = regionalStaff.filter((person) => isStaffInductedForSite(person, site) === true);
    const assignedNames = parseCrewNames(job.crew);
    const assignedStaff = assignedNames.map((name) => staffByName(staffResult.staff, name)).filter(Boolean) as OdinStaffEntity[];
    const assignedUnavailable = assignedStaff.filter((person) => isStaffAvailableForJob(person, job.job_date, time) === false);
    const assignedNotInducted = assignedStaff.filter((person) => isStaffInductedForSite(person, site) === false);
    const items = [];

    if (crewLooksUnassigned(job.crew)) {
      items.push({
        id: `crew:${job.id}`,
        jobId: job.id,
        title: `${region} roster gap - ${site}`,
        region,
        severity: job.severity === "red" ? "red" : "amber",
        dueAt: `${job.job_date}T${time}:00+10:00`,
        reason: "No assigned crew is visible for this scheduled job.",
        recommendedAction: `Assign a suitable ${region} crew for ${site}. Check availability and induction eligibility before confirming.`,
        staffSuggestions: availableStaff.slice(0, 5).map((person) => person.name),
        entityType: "calendar_job",
        entityId: job.id
      });
    }

    if (regionalStaff.length && !availableStaff.length) {
      items.push({
        id: `availability:${job.id}`,
        jobId: job.id,
        title: `${region} availability gap - ${site}`,
        region,
        severity: "amber",
        dueAt: `${job.job_date}T${time}:00+10:00`,
        reason: "No available staff windows match this scheduled job time.",
        recommendedAction: `Review staff availability for ${region} before confirming ${site}.`,
        staffSuggestions: [],
        entityType: "calendar_job",
        entityId: job.id
      });
    }

    if (site !== "Unassigned site" && regionalStaff.length && !inductedStaff.length) {
      items.push({
        id: `induction:${job.id}`,
        jobId: job.id,
        title: `${region} induction gap - ${site}`,
        region,
        severity: "red",
        dueAt: `${job.job_date}T${time}:00+10:00`,
        reason: "No inducted regional staff are visible for this site.",
        recommendedAction: `Confirm site induction coverage for ${site} before the job proceeds.`,
        staffSuggestions: [],
        entityType: "calendar_job",
        entityId: job.id
      });
    }

    assignedUnavailable.forEach((person) => {
      items.push({
        id: `assigned-unavailable:${job.id}:${person.id}`,
        jobId: job.id,
        title: `${person.name} unavailable for ${site}`,
        region,
        severity: "amber",
        dueAt: `${job.job_date}T${time}:00+10:00`,
        reason: "Assigned staff member appears unavailable for this job window.",
        recommendedAction: `Review ${person.name}'s availability or replace them before the shift.`,
        staffSuggestions: availableStaff.filter((candidate) => candidate.id !== person.id).slice(0, 5).map((candidate) => candidate.name),
        entityType: "staff_profile",
        entityId: person.id
      });
    });

    assignedNotInducted.forEach((person) => {
      items.push({
        id: `assigned-not-inducted:${job.id}:${person.id}`,
        jobId: job.id,
        title: `${person.name} not inducted for ${site}`,
        region,
        severity: "red",
        dueAt: `${job.job_date}T${time}:00+10:00`,
        reason: "Assigned staff member is not showing as inducted for this site.",
        recommendedAction: `Do not confirm ${person.name} for ${site} unless induction status is corrected.`,
        staffSuggestions: inductedStaff.filter((candidate) => candidate.id !== person.id).slice(0, 5).map((candidate) => candidate.name),
        entityType: "staff_profile",
        entityId: person.id
      });
    });

    return items;
  });

  return {
    connected: !staffResult.error && !jobsResult.error,
    generatedAt: new Date().toISOString(),
    staffSource: staffResult.source,
    errors: [staffResult.error, jobsResult.error].filter(Boolean),
    gapCount: gaps.length,
    gaps
  };
}
