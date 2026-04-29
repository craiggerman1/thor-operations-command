const weekNames = ["A Week", "B Week", "C Week", "D Week"] as const;
const anchorWeekIndex = 2;
const dayMs = 24 * 60 * 60 * 1000;

function utcDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export function getThorOperatingWeek(date = new Date()) {
  const anchor = new Date(2026, 3, 30);
  const daysFromAnchor = Math.floor((utcDay(date) - utcDay(anchor)) / dayMs);
  const weekOffset = Math.floor(daysFromAnchor / 7);
  const weekIndex = mod(anchorWeekIndex + weekOffset, weekNames.length);
  const start = addDays(anchor, weekOffset * 7);
  const end = addDays(start, 6);

  return {
    name: weekNames[weekIndex],
    detail: `${formatDay(start)} - ${formatDay(end)}`,
    start,
    end
  };
}
