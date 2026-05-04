import type { CalendarDay } from "@/lib/toc-data";
import type { TocWeatherDay, WeatherIcon } from "@/lib/weather";

type ForecastIcon = WeatherIcon;

const goldCoastPattern: ForecastIcon[] = ["clear", "cloud", "rain", "clear", "storm", "cloud", "clear"];
const regionalPattern: Record<string, ForecastIcon[]> = {
  National: goldCoastPattern,
  Brisbane: ["storm", "rain", "cloud", "clear", "storm", "clear", "cloud"],
  Sydney: ["cloud", "rain", "clear", "clear", "cloud", "rain", "clear"],
  Melbourne: ["rain", "cloud", "clear", "rain", "cloud", "clear", "cloud"],
  Adelaide: ["clear", "clear", "cloud", "clear", "rain", "clear", "clear"],
  Perth: ["clear", "cloud", "clear", "clear", "rain", "cloud", "clear"],
  Canberra: ["cloud", "clear", "rain", "cloud", "clear", "clear", "rain"],
  Workshop: goldCoastPattern
};

const forecastLabel: Record<ForecastIcon, string> = {
  clear: "Clear",
  cloud: "Cloud",
  rain: "Rain",
  storm: "Storm risk"
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

  const pattern = regionalPattern[scope] || goldCoastPattern;
  const dateNumber = Number(day.date) || 1;
  const icon = pattern[(dateNumber - 1) % pattern.length];
  const condition = forecastLabel[icon];
  return {
    icon,
    condition,
    label: `${location}: ${condition}`
  };
}
