import type { CalendarDay } from "@/lib/toc-data";

type ForecastIcon = "clear" | "cloud" | "rain" | "storm";

const nationalPattern: ForecastIcon[] = ["clear", "cloud", "rain", "clear", "storm", "cloud", "clear"];
const regionalPattern: Record<string, ForecastIcon[]> = {
  Brisbane: ["storm", "rain", "cloud", "clear", "storm", "clear", "cloud"],
  Sydney: ["cloud", "rain", "clear", "clear", "cloud", "rain", "clear"],
  Melbourne: ["rain", "cloud", "clear", "rain", "cloud", "clear", "cloud"],
  Adelaide: ["clear", "clear", "cloud", "clear", "rain", "clear", "clear"],
  Perth: ["clear", "cloud", "clear", "clear", "rain", "cloud", "clear"],
  Canberra: ["cloud", "clear", "rain", "cloud", "clear", "clear", "rain"],
  Workshop: ["cloud", "clear", "clear", "rain", "cloud", "clear", "clear"]
};

const forecastLabel: Record<ForecastIcon, string> = {
  clear: "Clear forecast",
  cloud: "Cloud forecast",
  rain: "Rain forecast",
  storm: "Storm risk"
};

export function getCalendarForecast(day: CalendarDay, scope: string) {
  const pattern = regionalPattern[scope] || nationalPattern;
  const dateNumber = Number(day.date) || 1;
  const icon = pattern[(dateNumber - 1) % pattern.length];
  return {
    icon,
    label: forecastLabel[icon]
  };
}
