import {
  explainStaffAvailabilityForJob,
  isStaffInductedForSite,
  readOdinStaffEntities,
  type OdinStaffEntity,
  type StaffAvailabilityCheckResult
} from "@/lib/odin-staff";
import { odinDedupeKey } from "@/lib/odin-operational-context";
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
  required_crew_count?: number | null;
  site_id?: string | null;
};

type StaffSuitability = {
  id: string;
  name: string;
  score: number;
  role: string;
  regions: string[];
  availability: "available" | "unavailable" | "unknown";
  availabilityDetail: StaffAvailabilityCheckResult;
  commitment: "free" | "committed";
  conflictingJobs: { id: string; title: string; site: string; region: string; dueAt: string }[];
  induction: "inducted" | "not_inducted" | "unknown";
  reasons: string[];
  cautions: string[];
};

type StaffAvailabilityDiagnostic = {
  id: string;
  name: string;
  sheetName: string;
  available: boolean | null;
  checkedWindows: StaffAvailabilityCheckResult["checkedWindows"];
  explanation: string;
};

type OdinRosterGap = {
  id: string;
  jobId: string;
  title: string;
  region: string;
  severity: string;
  dueAt: string;
  dedupeKey: string;
  gapType: string;
  reason: string;
  recommendedAction: string;
  requiredCrew: number;
  assignedCrewCount: number;
  availabilityDetail: StaffAvailabilityCheckResult | null;
  availabilityDiagnostics: StaffAvailabilityDiagnostic[];
  staffSuggestions: StaffSuitability[];
  staffSuggestionNames: string[];
  entityType: string;
  entityId: string;
  alreadyActioned: boolean;
  linkedActionId: string | null;
  linkedActionStatus: string | null;
  linkedActionHref: string | null;
};

type RosterGapResult = {
  connected: boolean;
  generatedAt: string;
  staffSource: string;
  errors: string[];
  gapCount: number;
  gaps: OdinRosterGap[];
};

let rosterGapCache: { expiresAt: number; result: RosterGapResult } | null = null;
const rosterGapCacheMs = 25000;

export function clearOdinRosterGapCache() {
  rosterGapCache = null;
}

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

function normaliseName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function staffForRegion(staff: OdinStaffEntity[], region: string) {
  return staff.filter((person) => person.status !== "inactive" && person.regions.some((staffRegion) => staffRegion.toLowerCase() === region.toLowerCase()));
}

function staffByName(staff: OdinStaffEntity[], name: string) {
  const cleanName = normaliseName(name);
  return staff.find((person) => normaliseName(person.name) === cleanName || (person.preferredName ? normaliseName(person.preferredName) === cleanName : false));
}

function jobRequiresMoreThanOnePerson(job: CalendarJobRow) {
  const searchText = `${job.job_title || ""} ${job.site || ""} ${job.location || ""}`.toLowerCase();
  if (/workshop|asset repair|admin|coverage|national/.test(searchText)) return false;
  return true;
}

function requiredCrewCount(job: CalendarJobRow) {
  if (typeof job.required_crew_count === "number" && job.required_crew_count >= 0) return job.required_crew_count;
  return jobRequiresMoreThanOnePerson(job) ? 2 : 1;
}

function rosterGapKey(input: { region: string; jobId: string; gapType: string; entityId?: string | null; dueAt: string }) {
  return odinDedupeKey(["roster-gap", input.region, input.jobId, input.gapType, input.entityId || "job", input.dueAt]);
}

function matchSkill(person: OdinStaffEntity, job: CalendarJobRow) {
  const searchText = `${job.job_title || ""} ${job.site || ""}`.toLowerCase();
  return person.skills.find((skill) => searchText.includes(skill.toLowerCase()));
}

function jobStartDate(job: CalendarJobRow) {
  const time = job.job_time || "07:00";
  const [hourPart = "7", minutePart = "0"] = String(time).split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  return new Date(`${job.job_date}T${String(Number.isFinite(hour) ? hour : 7).padStart(2, "0")}:${String(Number.isFinite(minute) ? minute : 0).padStart(2, "0")}:00+10:00`);
}

function activeRosterJob(job: CalendarJobRow) {
  return !["completed", "cancelled", "closed", "complete"].includes(String(job.status || "").toLowerCase());
}

function jobClashes(first: CalendarJobRow, second: CalendarJobRow) {
  const firstStart = jobStartDate(first).getTime();
  const secondStart = jobStartDate(second).getTime();
  if (!Number.isFinite(firstStart) || !Number.isFinite(secondStart)) return false;
  const shiftWindowMs = 6 * 60 * 60 * 1000;
  return Math.abs(firstStart - secondStart) < shiftWindowMs;
}

function staffAssignedToJob(person: OdinStaffEntity, job: CalendarJobRow) {
  const staffNames = [person.name, person.preferredName || "", person.availabilitySheetName, person.inductionSheetName]
    .filter(Boolean)
    .map((name) => normaliseName(String(name)));
  const crewNames = parseCrewNames(job.crew).map(normaliseName);
  return crewNames.some((crewName) => staffNames.includes(crewName));
}

function rosterCommitmentsForStaff(person: OdinStaffEntity, targetJob: CalendarJobRow, jobs: CalendarJobRow[]) {
  return jobs
    .filter((job) => job.id !== targetJob.id && activeRosterJob(job) && staffAssignedToJob(person, job) && jobClashes(targetJob, job))
    .map((job) => ({
      id: job.id,
      title: job.job_title || "Scheduled wash",
      site: job.site || "Unassigned site",
      region: job.location || "National",
      dueAt: `${job.job_date}T${job.job_time || "07:00"}:00+10:00`
    }));
}

function scoreStaffForJob(person: OdinStaffEntity, job: CalendarJobRow, region: string, site: string, time: string, jobs: CalendarJobRow[]): StaffSuitability {
  const availabilityDetail = explainStaffAvailabilityForJob(person, job.job_date, time);
  const available = availabilityDetail.available;
  const inducted = site === "Unassigned site" ? null : isStaffInductedForSite(person, site);
  const sameRegion = person.regions.some((staffRegion) => staffRegion.toLowerCase() === region.toLowerCase());
  const matchedSkill = matchSkill(person, job);
  const conflictingJobs = rosterCommitmentsForStaff(person, job, jobs);
  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 0;

  if (person.status === "active") {
    score += 20;
    reasons.push("active staff profile");
  } else if (person.status === "watch") {
    score += 8;
    cautions.push("staff status is watch");
  } else {
    score -= 100;
    cautions.push("inactive staff profile");
  }

  if (sameRegion) {
    score += 25;
    reasons.push(`${region} region responsibility`);
  } else {
    score -= 15;
    cautions.push(`not assigned to ${region}`);
  }

  if (available === true) {
    score += 35;
    reasons.push("available for the job window");
  } else if (available === false) {
    score -= 80;
    cautions.push("marked unavailable for the job window");
  } else {
    score += 5;
    cautions.push("availability not confirmed");
  }

  if (conflictingJobs.length) {
    score -= 100;
    cautions.push(`already rostered on ${conflictingJobs[0].site} at a clashing time`);
  } else {
    score += 20;
    reasons.push("not already committed to another rostered job in this shift window");
  }

  if (inducted === true) {
    score += 30;
    reasons.push(`inducted for ${site}`);
  } else if (inducted === false) {
    score -= 70;
    cautions.push(`not inducted for ${site}`);
  } else {
    score += 5;
    cautions.push(site === "Unassigned site" ? "site not supplied" : "induction not confirmed");
  }

  if (matchedSkill) {
    score += 10;
    reasons.push(`skill match: ${matchedSkill}`);
  }

  return {
    id: person.id,
    name: person.name,
    score: Math.max(0, Math.min(100, score)),
    role: person.role,
    regions: person.regions,
    availability: available === true ? "available" : available === false ? "unavailable" : "unknown",
    availabilityDetail,
    commitment: conflictingJobs.length ? "committed" : "free",
    conflictingJobs,
    induction: inducted === true ? "inducted" : inducted === false ? "not_inducted" : "unknown",
    reasons,
    cautions
  };
}

function staffSuitabilityForJob(staff: OdinStaffEntity[], jobs: CalendarJobRow[], job: CalendarJobRow, region: string, site: string, time: string, excludeIds: string[] = []) {
  return staff
    .filter((person) => !excludeIds.includes(person.id) && person.status !== "inactive")
    .map((person) => scoreStaffForJob(person, job, region, site, time, jobs))
    .filter((suggestion) => suggestion.score > 0 && suggestion.commitment === "free")
    .sort((first, second) => second.score - first.score)
    .slice(0, 5);
}

function suggestionNames(suggestions: StaffSuitability[]) {
  return suggestions.map((suggestion) => suggestion.name);
}

function recommendationWithSuggestions(base: string, suggestions: StaffSuitability[]) {
  if (!suggestions.length) return base;
  const topSuggestions = suggestions.slice(0, 3).map((suggestion) => {
    const reason = suggestion.reasons.slice(0, 2).join(", ");
    return `${suggestion.name} (${suggestion.score}/100${reason ? ` - ${reason}` : ""})`;
  }).join("; ");
  return `${base} Suggested staff: ${topSuggestions}. Suggestions exclude staff already rostered on another clashing calendar job.`;
}

function availabilityDiagnosticsForStaff(staff: OdinStaffEntity[], jobDate: string, time: string): StaffAvailabilityDiagnostic[] {
  return staff.slice(0, 20).map((person) => {
    const detail = explainStaffAvailabilityForJob(person, jobDate, time);
    return {
      id: person.id,
      name: person.name,
      sheetName: person.availabilitySheetName,
      available: detail.available,
      checkedWindows: detail.checkedWindows,
      explanation: detail.explanation
    };
  });
}

async function readRosterJobs() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { jobs: [] as CalendarJobRow[], error: "Supabase server key is not configured." };

  const today = new Date();
  const startDate = dateOnly(today);
  const endDate = dateOnly(addDays(today, 14));
  const { data, error } = await supabase
    .from("calendar_jobs")
    .select("id,job_date,job_time,location,site,crew,job_title,status,severity,required_crew_count,site_id")
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

async function readLinkedRosterActions(dedupeKeys: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !dedupeKeys.length) return new Map<string, { id: string; status: string; title: string }>();

  const { data } = await supabase
    .from("odin_memory")
    .select("facts,source_id,title")
    .eq("source_type", "action_item");

  const memoryRows = ((data || []) as Array<{
    facts?: { dedupeKey?: string } | null;
    source_id?: string | null;
    title?: string | null;
  }>).filter((row) => row.source_id && row.facts?.dedupeKey && dedupeKeys.includes(row.facts.dedupeKey));
  const actionIds = Array.from(new Set(memoryRows.map((row) => row.source_id).filter(Boolean) as string[]));
  if (!actionIds.length) return new Map();

  const { data: actionRows } = await supabase
    .from("action_items")
    .select("id,status,title")
    .in("id", actionIds);
  const actions = new Map(((actionRows || []) as Array<{ id: string; status: string; title: string }>).map((row) => [row.id, row]));
  const linked = new Map<string, { id: string; status: string; title: string }>();

  memoryRows.forEach((row) => {
    const action = row.source_id ? actions.get(row.source_id) : undefined;
    if (row.facts?.dedupeKey && action && action.status !== "closed") {
      linked.set(row.facts.dedupeKey, action);
    }
  });

  return linked;
}

export async function buildOdinRosterGaps(options: { forceRefresh?: boolean } = {}) {
  if (!options.forceRefresh && rosterGapCache && rosterGapCache.expiresAt > Date.now()) {
    return rosterGapCache.result;
  }

  const [staffResult, jobsResult] = await Promise.all([
    readOdinStaffEntities({ includeProtected: true }),
    readRosterJobs()
  ]);

  const rawGaps = jobsResult.jobs.flatMap((job) => {
    const region = job.location || "National";
    const site = job.site || "Unassigned site";
    const time = job.job_time || "07:00";
    const requiredCrew = requiredCrewCount(job);
    const regionalStaff = staffForRegion(staffResult.staff, region);
    const availabilityDiagnostics = availabilityDiagnosticsForStaff(regionalStaff, job.job_date, time);
    const availabilityLookup = new Map(availabilityDiagnostics.map((diagnostic) => [diagnostic.id, diagnostic]));
    const availableStaff = regionalStaff.filter((person) => availabilityLookup.get(person.id)?.available === true);
    const inductedStaff = regionalStaff.filter((person) => isStaffInductedForSite(person, site) === true);
    const assignedNames = parseCrewNames(job.crew);
    const assignedStaff = assignedNames.map((name) => staffByName(staffResult.staff, name)).filter(Boolean) as OdinStaffEntity[];
    const assignedIds = assignedStaff.map((person) => person.id);
    const assignedAvailabilityDiagnostics = availabilityDiagnosticsForStaff(assignedStaff, job.job_date, time);
    const assignedAvailabilityLookup = new Map(assignedAvailabilityDiagnostics.map((diagnostic) => [diagnostic.id, diagnostic]));
    const assignedUnavailable = assignedStaff.filter((person) => assignedAvailabilityLookup.get(person.id)?.available === false);
    const assignedNotInducted = assignedStaff.filter((person) => isStaffInductedForSite(person, site) === false);
    const suitableStaff = staffSuitabilityForJob(regionalStaff, jobsResult.jobs, job, region, site, time, assignedIds);
    const items = [];

    if (crewLooksUnassigned(job.crew)) {
      const dueAt = `${job.job_date}T${time}:00+10:00`;
      const dedupeKey = rosterGapKey({ region, jobId: job.id, gapType: "crew", dueAt });
      const recommendedAction = recommendationWithSuggestions(
        `Assign a suitable ${region} crew for ${site}. Check availability and induction eligibility before confirming.`,
        suitableStaff
      );
      items.push({
        id: `crew:${job.id}`,
        jobId: job.id,
        title: `${region} roster gap - ${site}`,
        region,
        severity: job.severity === "red" ? "red" : "amber",
        dueAt,
        dedupeKey,
        gapType: "crew",
        reason: "No assigned crew is visible for this scheduled job.",
        recommendedAction,
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        availabilityDetail: null,
        availabilityDiagnostics: availabilityDiagnostics.slice(0, 8),
        staffSuggestions: suitableStaff,
        staffSuggestionNames: suggestionNames(suitableStaff),
        entityType: "calendar_job",
        entityId: job.id
      });
    }

    if (!crewLooksUnassigned(job.crew) && assignedStaff.length < requiredCrew) {
      const dueAt = `${job.job_date}T${time}:00+10:00`;
      const dedupeKey = rosterGapKey({ region, jobId: job.id, gapType: "under-covered", dueAt });
      const needed = requiredCrew - assignedStaff.length;
      const recommendedAction = recommendationWithSuggestions(
        `Add ${needed} more suitable staff member${needed === 1 ? "" : "s"} for ${site} before confirming the roster.`,
        suitableStaff
      );
      items.push({
        id: `under-covered:${job.id}`,
        jobId: job.id,
        title: `${region} under-covered job - ${site}`,
        region,
        severity: job.severity === "red" ? "red" : "amber",
        dueAt,
        dedupeKey,
        gapType: "under-covered",
        reason: `Only ${assignedStaff.length} of ${requiredCrew} required crew are visible for this job.`,
        recommendedAction,
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        availabilityDetail: null,
        availabilityDiagnostics: availabilityDiagnostics.slice(0, 8),
        staffSuggestions: suitableStaff,
        staffSuggestionNames: suggestionNames(suitableStaff),
        entityType: "calendar_job",
        entityId: job.id
      });
    }

    if (regionalStaff.length && !availableStaff.length) {
      const dueAt = `${job.job_date}T${time}:00+10:00`;
      const dedupeKey = rosterGapKey({ region, jobId: job.id, gapType: "availability", dueAt });
      items.push({
        id: `availability:${job.id}`,
        jobId: job.id,
        title: `${region} availability gap - ${site}`,
        region,
        severity: "amber",
        dueAt,
        dedupeKey,
        gapType: "availability",
        reason: "No available staff windows match this scheduled job time.",
        recommendedAction: `Review staff availability for ${region} before confirming ${site}.`,
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        availabilityDetail: availabilityDiagnostics[0]
          ? {
              available: availabilityDiagnostics[0].available,
              jobDate: job.job_date,
              jobTime: time,
              bufferHours: 2,
              checkedWindows: availabilityDiagnostics[0].checkedWindows,
              explanation: `TOC found no available ${region} staff after applying the 2 hour buffer to ${time}.`
            }
          : null,
        availabilityDiagnostics: availabilityDiagnostics.slice(0, 12),
        staffSuggestions: [],
        staffSuggestionNames: [],
        entityType: "calendar_job",
        entityId: job.id
      });
    }

    if (site !== "Unassigned site" && regionalStaff.length && !inductedStaff.length) {
      const dueAt = `${job.job_date}T${time}:00+10:00`;
      const dedupeKey = rosterGapKey({ region, jobId: job.id, gapType: "induction", dueAt });
      items.push({
        id: `induction:${job.id}`,
        jobId: job.id,
        title: `${region} induction gap - ${site}`,
        region,
        severity: "red",
        dueAt,
        dedupeKey,
        gapType: "induction",
        reason: "No inducted regional staff are visible for this site.",
        recommendedAction: `Confirm site induction coverage for ${site} before the job proceeds.`,
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        availabilityDetail: null,
        availabilityDiagnostics: availabilityDiagnostics.slice(0, 8),
        staffSuggestions: [],
        staffSuggestionNames: [],
        entityType: "calendar_job",
        entityId: job.id
      });
    }

    assignedUnavailable.forEach((person) => {
      const dueAt = `${job.job_date}T${time}:00+10:00`;
      const dedupeKey = rosterGapKey({ region, jobId: job.id, gapType: "assigned-unavailable", entityId: person.id, dueAt });
      const replacementSuggestions = staffSuitabilityForJob(regionalStaff, jobsResult.jobs, job, region, site, time, [person.id]);
      const availabilityDetail = explainStaffAvailabilityForJob(person, job.job_date, time);
      items.push({
        id: `assigned-unavailable:${job.id}:${person.id}`,
        jobId: job.id,
        title: `${person.name} unavailable for ${site}`,
        region,
        severity: "amber",
        dueAt,
        dedupeKey,
        gapType: "assigned-unavailable",
        reason: "Assigned staff member appears unavailable for this job window.",
        recommendedAction: recommendationWithSuggestions(`Review ${person.name}'s availability or replace them before the shift.`, replacementSuggestions),
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        availabilityDetail,
        availabilityDiagnostics: [assignedAvailabilityLookup.get(person.id)].filter(Boolean) as StaffAvailabilityDiagnostic[],
        staffSuggestions: replacementSuggestions,
        staffSuggestionNames: suggestionNames(replacementSuggestions),
        entityType: "staff_profile",
        entityId: person.id
      });
    });

    assignedNotInducted.forEach((person) => {
      const dueAt = `${job.job_date}T${time}:00+10:00`;
      const dedupeKey = rosterGapKey({ region, jobId: job.id, gapType: "assigned-not-inducted", entityId: person.id, dueAt });
      const replacementSuggestions = staffSuitabilityForJob(inductedStaff, jobsResult.jobs, job, region, site, time, [person.id]);
      items.push({
        id: `assigned-not-inducted:${job.id}:${person.id}`,
        jobId: job.id,
        title: `${person.name} not inducted for ${site}`,
        region,
        severity: "red",
        dueAt,
        dedupeKey,
        gapType: "assigned-not-inducted",
        reason: "Assigned staff member is not showing as inducted for this site.",
        recommendedAction: recommendationWithSuggestions(`Do not confirm ${person.name} for ${site} unless induction status is corrected.`, replacementSuggestions),
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        availabilityDetail: null,
        availabilityDiagnostics: availabilityDiagnostics.slice(0, 8),
        staffSuggestions: replacementSuggestions,
        staffSuggestionNames: suggestionNames(replacementSuggestions),
        entityType: "staff_profile",
        entityId: person.id
      });
    });

    return items;
  });
  const linkedActions = await readLinkedRosterActions(rawGaps.map((gap) => gap.dedupeKey));
  const gaps = rawGaps.map((gap) => {
    const linkedAction = linkedActions.get(gap.dedupeKey);
    return {
      ...gap,
      alreadyActioned: Boolean(linkedAction),
      linkedActionId: linkedAction?.id || null,
      linkedActionStatus: linkedAction?.status || null,
      linkedActionHref: linkedAction ? `/actions/${linkedAction.id}` : null
    };
  });

  const result = {
    connected: !staffResult.error && !jobsResult.error,
    generatedAt: new Date().toISOString(),
    staffSource: staffResult.source,
    errors: [staffResult.error, jobsResult.error].filter((error): error is string => Boolean(error)),
    gapCount: gaps.length,
    gaps
  };

  rosterGapCache = { expiresAt: Date.now() + rosterGapCacheMs, result };
  return result;
}
