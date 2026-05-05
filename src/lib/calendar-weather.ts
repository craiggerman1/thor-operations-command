import type { TocWeatherDay, WeatherIcon } from "@/lib/weather";
import type { CalendarDay } from "@/lib/toc-data";

type ForecastIcon = WeatherIcon;

const forecastLabel: Record<ForecastIcon, string> = {
  clear: "Clear",
  cloud: "Cloud",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  storm: "Storm risk",
  pending: "Pending"
};

const monthNumber: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12"
};

function getCalendarDateKey(day: CalendarDay) {
  const month = monthNumber[day.month];
  if (!month) return "";
  return `2026-${month}-${day.date.padStart(2, "0")}`;
}

export function getCalendarForecast(day: CalendarDay, scope: string, liveForecast: TocWeatherDay[] = []) {
  const liveDay = liveForecast.find((forecastDay) => forecastDay.date === getCalendarDateKey(day));
  const location = scope === "National" || scope === "Workshop" ? "Gold Coast" : scope;

  if (liveDay) {
    return {
      icon: liveDay.icon,
      condition: liveDay.condition,
      label: `${location}: ${liveDay.condition}${liveDay.maxTemp !== null ? `, ${Math.round(liveDay.maxTemp)} C max` : ""}`
    };
  }

  const icon = "pending";
  const condition = forecastLabel[icon];
  return {
    icon,
    condition,
    label: `${location}: forecast not supplied yet`
  };
}
