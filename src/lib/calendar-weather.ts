import type { CalendarDay } from "@/lib/toc-data";

type ForecastIcon = "clear" | "cloud" | "rain" | "storm";

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

export function getCalendarForecast(day: CalendarDay, scope: string) {
  const pattern = regionalPattern[scope] || goldCoastPattern;
  const dateNumber = Number(day.date) || 1;
  const icon = pattern[(dateNumber - 1) % pattern.length];
  const location = scope === "National" || scope === "Workshop" ? "Gold Coast" : scope;
  const condition = forecastLabel[icon];
  return {
    icon,
    condition,
    label: `${location}: ${condition}`
  };
}
