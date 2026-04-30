import { calendarWeeks } from "@/lib/toc-data";
import type { CalendarDay, CalendarJob } from "@/lib/toc-data";

export const calendarWeekdays = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];
export const calendarStorageKey = "toc.calendarWeeks";

export function getCalendarDaySlug(day: CalendarDay) {
  return `${day.day}-${day.date}-${day.month}-${day.week}`.toLowerCase().replace(/\s+/g, "-");
}

export function getCalendarDays() {
  return calendarWeeks.flatMap((week) => week);
}

export function getCalendarDayBySlug(slug: string) {
  return getCalendarDays().find((day) => getCalendarDaySlug(day) === slug);
}

export function getCalendarDayFromWeeks(weeks: CalendarDay[][], slug: string) {
  return weeks.flatMap((week) => week).find((day) => getCalendarDaySlug(day) === slug);
}

export function filterCalendarJobs(day: CalendarDay, scope: string) {
  return day.jobs.filter((job) => scope === "National" || job.location === scope || job.location === "National");
}

export function getStoredCalendarWeeks() {
  if (typeof window === "undefined") return calendarWeeks;

  try {
    const stored = localStorage.getItem(calendarStorageKey);
    return stored ? JSON.parse(stored) as CalendarDay[][] : calendarWeeks;
  } catch {
    return calendarWeeks;
  }
}

export function saveStoredCalendarWeeks(weeks: CalendarDay[][]) {
  localStorage.setItem(calendarStorageKey, JSON.stringify(weeks));
}

export function updateCalendarJob(weeks: CalendarDay[][], daySlug: string, jobIndex: number, nextJob: CalendarJob) {
  return weeks.map((week) => week.map((day) => {
    if (getCalendarDaySlug(day) !== daySlug) return day;

    return {
      ...day,
      jobs: day.jobs.map((job, index) => index === jobIndex ? nextJob : job)
    };
  }));
}
