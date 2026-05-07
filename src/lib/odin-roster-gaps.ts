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

type StaffSuitability = {
  id: string;
  name: string;
  score: number;
  role: string;
  regions: string[];
  availability: "available" | "unavailable" | "unknown";
  induction: "inducted" | "not_inducted" | "unknown";
  reasons: string[];
  cautions: string[];
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

function jobRequiresMoreThanOnePerson(job: CalendarJobRow) {
  const searchText = `${job.job_title || ""} ${job.site || ""} ${job.location || ""}`.toLowerCase();
  if (/workshop|asset repair|admin|coverage|national/.test(searchText)) return false;
  return true;
}

function requiredCrewCount(job: CalendarJobRow) {
  return jobRequiresMoreThanOnePerson(job) ? 2 : 1;
}

function matchSkill(person: OdinStaffEntity, job: CalendarJobRow) {
  const searchText = `${job.job_title || ""} ${job.site || ""}`.toLowerCase();
  return person.skills.find((skill) => searchText.includes(skill.toLowerCase()));
}

function scoreStaffForJob(person: OdinStaffEntity, job: CalendarJobRow, region: string, site: string, time: string): StaffSuitability {
  const available = isStaffAvailableForJob(person, job.job_date, time);
  const inducted = site === "Unassigned site" ? null : isStaffInductedForSite(person, site);
  const sameRegion = person.regions.some((staffRegion) => staffRegion.toLowerCase() === region.toLowerCase());
  const matchedSkill = matchSkill(person, job);
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
    induction: inducted === true ? "inducted" : inducted === false ? "not_inducted" : "unknown",
    reasons,
    cautions
  };
}

function staffSuitabilityForJob(staff: OdinStaffEntity[], job: CalendarJobRow, region: string, site: string, time: string, excludeIds: string[] = []) {
  return staff
    .filter((person) => !excludeIds.includes(person.id) && person.status !== "inactive")
    .map((person) => scoreStaffForJob(person, job, region, site, time))
    .filter((suggestion) => suggestion.score > 0)
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
  return `${base} Suggested staff: ${topSuggestions}.`;
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
    const requiredCrew = requiredCrewCount(job);
    const regionalStaff = staffForRegion(staffResult.staff, region);
    const availableStaff = regionalStaff.filter((person) => isStaffAvailableForJob(person, job.job_date, time) === true);
    const inductedStaff = regionalStaff.filter((person) => isStaffInductedForSite(person, site) === true);
    const assignedNames = parseCrewNames(job.crew);
    const assignedStaff = assignedNames.map((name) => staffByName(staffResult.staff, name)).filter(Boolean) as OdinStaffEntity[];
    const assignedIds = assignedStaff.map((person) => person.id);
    const assignedUnavailable = assignedStaff.filter((person) => isStaffAvailableForJob(person, job.job_date, time) === false);
    const assignedNotInducted = assignedStaff.filter((person) => isStaffInductedForSite(person, site) === false);
    const suitableStaff = staffSuitabilityForJob(regionalStaff, job, region, site, time, assignedIds);
    const items = [];

    if (crewLooksUnassigned(job.crew)) {
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
        dueAt: `${job.job_date}T${time}:00+10:00`,
        reason: "No assigned crew is visible for this scheduled job.",
        recommendedAction,
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        staffSuggestions: suitableStaff,
        staffSuggestionNames: suggestionNames(suitableStaff),
        entityType: "calendar_job",
        entityId: job.id
      });
    }

    if (!crewLooksUnassigned(job.crew) && assignedStaff.length < requiredCrew) {
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
        dueAt: `${job.job_date}T${time}:00+10:00`,
        reason: `Only ${assignedStaff.length} of ${requiredCrew} required crew are visible for this job.`,
        recommendedAction,
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        staffSuggestions: suitableStaff,
        staffSuggestionNames: suggestionNames(suitableStaff),
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
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        staffSuggestions: [],
        staffSuggestionNames: [],
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
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        staffSuggestions: [],
        staffSuggestionNames: [],
        entityType: "calendar_job",
        entityId: job.id
      });
    }

    assignedUnavailable.forEach((person) => {
      const replacementSuggestions = staffSuitabilityForJob(regionalStaff, job, region, site, time, [person.id]);
      items.push({
        id: `assigned-unavailable:${job.id}:${person.id}`,
        jobId: job.id,
        title: `${person.name} unavailable for ${site}`,
        region,
        severity: "amber",
        dueAt: `${job.job_date}T${time}:00+10:00`,
        reason: "Assigned staff member appears unavailable for this job window.",
        recommendedAction: recommendationWithSuggestions(`Review ${person.name}'s availability or replace them before the shift.`, replacementSuggestions),
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        staffSuggestions: replacementSuggestions,
        staffSuggestionNames: suggestionNames(replacementSuggestions),
        entityType: "staff_profile",
        entityId: person.id
      });
    });

    assignedNotInducted.forEach((person) => {
      const replacementSuggestions = staffSuitabilityForJob(inductedStaff, job, region, site, time, [person.id]);
      items.push({
        id: `assigned-not-inducted:${job.id}:${person.id}`,
        jobId: job.id,
        title: `${person.name} not inducted for ${site}`,
        region,
        severity: "red",
        dueAt: `${job.job_date}T${time}:00+10:00`,
        reason: "Assigned staff member is not showing as inducted for this site.",
        recommendedAction: recommendationWithSuggestions(`Do not confirm ${person.name} for ${site} unless induction status is corrected.`, replacementSuggestions),
        requiredCrew,
        assignedCrewCount: assignedStaff.length,
        staffSuggestions: replacementSuggestions,
        staffSuggestionNames: suggestionNames(replacementSuggestions),
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
