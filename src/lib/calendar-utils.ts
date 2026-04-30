import { calendarWeeks } from "@/lib/toc-data";
import type { CalendarDay } from "@/lib/toc-data";

export const calendarWeekdays = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];

export function getCalendarDaySlug(day: CalendarDay) {
  return `${day.day}-${day.date}-${day.month}-${day.week}`.toLowerCase().replace(/\s+/g, "-");
}

export function getCalendarDays() {
  return calendarWeeks.flatMap((week) => week);
}

export function getCalendarDayBySlug(slug: string) {
  return getCalendarDays().find((day) => getCalendarDaySlug(day) === slug);
}

export function filterCalendarJobs(day: CalendarDay, scope: string) {
  return day.jobs.filter((job) => scope === "National" || job.location === scope || job.location === "National");
}
