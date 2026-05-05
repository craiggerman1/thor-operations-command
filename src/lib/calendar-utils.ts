import type { CalendarDay, CalendarJob } from "@/lib/toc-data";
import { getThorOperatingWeek } from "@/lib/operating-week";

export const calendarWeekdays = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];
export const calendarStorageKey = "toc.calendarWeeks";
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function getCalendarDaySlug(day: CalendarDay) {
  return `${day.day}-${day.date}-${day.month}-${day.week}`.toLowerCase().replace(/\s+/g, "-");
}

export function getCalendarDays() {
  return generateCalendarWeeks().flatMap((week) => week);
}

export function getVisibleCalendarDays(weeks: CalendarDay[][], today = new Date()) {
  const weekStart = getThorCalendarWeekStart(today);
  return weeks
    .flatMap((week) => week)
    .filter((day) => {
      const dayDate = getCalendarDate(day);
      return dayDate ? dayDate.getTime() >= weekStart.getTime() : true;
    })
    .slice(0, 28);
}

export function isCurrentCalendarDay(day: CalendarDay, today = new Date()) {
  const dayDate = getCalendarDate(day);
  return Boolean(dayDate && dayDate.getFullYear() === today.getFullYear() && dayDate.getMonth() === today.getMonth() && dayDate.getDate() === today.getDate());
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
  if (typeof window === "undefined") return generateCalendarWeeks();

  try {
    const stored = localStorage.getItem(calendarStorageKey);
    return stored ? JSON.parse(stored) as CalendarDay[][] : generateCalendarWeeks();
  } catch {
    return generateCalendarWeeks();
  }
}

export function saveStoredCalendarWeeks(weeks: CalendarDay[][]) {
  localStorage.setItem(calendarStorageKey, JSON.stringify(weeks));
}

export function updateCalendarJob(weeks: CalendarDay[][], daySlug: string, jobIndex: number, nextJob: CalendarJob) {
  const sourceDay = getCalendarDayFromWeeks(weeks, daySlug);
  const sourceDate = sourceDay ? getCalendarDate(sourceDay) : null;
  const recurrenceDays = getRecurrenceDays(nextJob);

  const updatedWeeks = weeks.map((week) => week.map((day) => {
    if (getCalendarDaySlug(day) !== daySlug) return day;

    return {
      ...day,
      jobs: day.jobs.map((job, index) => index === jobIndex ? nextJob : job)
    };
  }));

  if (!sourceDay || !sourceDate || !recurrenceDays) return updatedWeeks;

  return updatedWeeks.map((week) => week.map((day) => {
    const targetDate = getCalendarDate(day);
    if (!targetDate) return day;

    const diffDays = Math.round((targetDate.getTime() - sourceDate.getTime()) / 86400000);
    if (diffDays <= 0 || diffDays % recurrenceDays !== 0) return day;

    const recurringJob = {
      ...nextJob,
      notes: nextJob.notes || `Recurring from ${sourceDay.day} ${sourceDay.date} ${sourceDay.month}`
    };
    const existingIndex = day.jobs.findIndex((job) => isSameRecurringJob(job, recurringJob));

    return {
      ...day,
      jobs: existingIndex >= 0
        ? day.jobs.map((job, index) => index === existingIndex ? recurringJob : job)
        : [...day.jobs, recurringJob].sort((a, b) => a.time.localeCompare(b.time))
    };
  }));
}

export function getCalendarDate(day: CalendarDay) {
  if ("isoDate" in day && typeof day.isoDate === "string") {
    return new Date(`${day.isoDate}T00:00:00`);
  }

  const monthIndex = monthLabels.indexOf(day.month);
  if (monthIndex < 0) return null;
  const todayYear = new Date().getFullYear();
  return new Date(todayYear, monthIndex, Number(day.date));
}

function getThorCalendarWeekStart(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysSinceThursday = (start.getDay() + 3) % 7;
  start.setDate(start.getDate() - daysSinceThursday);
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function generateCalendarWeeks(today = new Date(), weekCount = 8): CalendarDay[][] {
  const currentWeek = getThorOperatingWeek(today);

  return Array.from({ length: weekCount }, (_, weekIndex) => {
    const weekStart = new Date(currentWeek.start);
    weekStart.setDate(currentWeek.start.getDate() + weekIndex * 7);
    const weekName = getThorOperatingWeek(weekStart).name;

    return calendarWeekdays.map((weekday, dayIndex) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayIndex);

      return {
        day: weekday,
        date: String(date.getDate()),
        month: monthLabels[date.getMonth()],
        week: weekName,
        isoDate: formatIsoDate(date),
        jobs: []
      } as CalendarDay;
    });
  });
}

function getRecurrenceDays(job: CalendarJob) {
  if (job.recurrence === "Daily") return 1;
  if (job.recurrence === "Weekly") return 7;
  if (job.recurrence === "Fortnightly") return 14;
  if (job.recurrence === "4 weekly") return 28;
  if (job.recurrence === "Custom" && job.recurrenceIntervalWeeks && job.recurrenceIntervalWeeks > 0) {
    return job.recurrenceIntervalWeeks * 7;
  }
  return null;
}

function isSameRecurringJob(a: CalendarJob, b: CalendarJob) {
  return a.time === b.time && a.location === b.location && a.site === b.site && a.job === b.job;
}
