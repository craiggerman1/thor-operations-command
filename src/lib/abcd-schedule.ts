export const THOR_ABCD_WEEKS = ["A", "B", "C", "D"] as const;

export type ThorAbcdWeek = (typeof THOR_ABCD_WEEKS)[number];

const abcdMarkerPattern = /\s*\[TOC_ABCD_WEEKS:([^\]]*)\]\s*/gi;
const thorAbcdAnchorWeek = "2026-04-30";
const thorAbcdAnchorIndex = 2; // 30 Apr 2026 is C Week.

function toUtcDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export function cleanAbcdWeeks(value: unknown): ThorAbcdWeek[] {
  const raw = Array.isArray(value)
    ? value.flatMap((item) => String(item).split(/[,;/\s]+/))
    : String(value || "").split(/[,;/\s]+/);
  return THOR_ABCD_WEEKS.filter((week) => raw.some((item) => item.trim().toUpperCase().replace(/[^ABCD]/g, "") === week));
}

export function extractAbcdWeeks(notes: string | null | undefined): ThorAbcdWeek[] {
  const text = notes || "";
  const matches = Array.from(text.matchAll(abcdMarkerPattern));
  const latest = matches.at(-1)?.[1] || "";
  return cleanAbcdWeeks(latest);
}

export function stripAbcdMarker(notes: string | null | undefined) {
  return (notes || "").replace(abcdMarkerPattern, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function composeScheduleNotes(notes: string | null | undefined, weeks: unknown) {
  const cleanNotes = stripAbcdMarker(notes);
  const selected = cleanAbcdWeeks(weeks);
  const marker = selected.length ? `[TOC_ABCD_WEEKS:${selected.join(",")}]` : "";
  return [cleanNotes, marker].filter(Boolean).join("\n");
}

export function formatAbcdWeeks(weeks: unknown) {
  const selected = cleanAbcdWeeks(weeks);
  return selected.length ? selected.join(", ") : "Every week";
}

export function thorAbcdWeekForDate(isoDate: string): ThorAbcdWeek {
  const date = toUtcDate(isoDate);
  const daysSinceThursday = modulo(date.getUTCDay() - 4, 7);
  date.setUTCDate(date.getUTCDate() - daysSinceThursday);
  const anchor = toUtcDate(thorAbcdAnchorWeek);
  const weeksSinceAnchor = Math.floor((date.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return THOR_ABCD_WEEKS[modulo(thorAbcdAnchorIndex + weeksSinceAnchor, THOR_ABCD_WEEKS.length)];
}

export function buildScheduleDates({
  startDate,
  endDate,
  stepDays,
  abcdWeeks,
  targetCount = 12
}: {
  startDate: string;
  endDate?: string | null;
  stepDays: number | null;
  abcdWeeks?: unknown;
  targetCount?: number;
}) {
  const selectedWeeks = cleanAbcdWeeks(abcdWeeks);
  const selectedSet = new Set<string>(selectedWeeks);
  const candidateCount = stepDays ? Math.max(targetCount * (selectedWeeks.length ? 8 : 2), targetCount) : 1;
  const dates: string[] = [];

  for (let index = 0; index < candidateCount && dates.length < targetCount; index += 1) {
    const date = stepDays ? toUtcDate(startDate) : toUtcDate(startDate);
    if (stepDays) date.setUTCDate(date.getUTCDate() + (stepDays * index));
    const isoDate = dateOnly(date);
    if (endDate && isoDate > endDate) break;
    if (selectedSet.size && !selectedSet.has(thorAbcdWeekForDate(isoDate))) continue;
    dates.push(isoDate);
  }

  return dates;
}
