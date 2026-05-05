export type WeatherIcon = "clear" | "cloud" | "fog" | "drizzle" | "rain" | "storm" | "pending";

export type TocWeatherDay = {
  date: string;
  icon: WeatherIcon;
  condition: string;
  maxTemp: number | null;
  minTemp: number | null;
  rainChance: number | null;
  rainTotal: number | null;
  windMax: number | null;
};

export type TocWeatherPayload = {
  location: string;
  scope: string;
  current: {
    temp: number | null;
    apparentTemp: number | null;
    wind: number | null;
    rain: number | null;
    icon: WeatherIcon;
    condition: string;
    updatedAt: string;
  };
  forecast: TocWeatherDay[];
  warning: {
    active: boolean;
    message: string;
    source?: string;
    link?: string | null;
  };
};

type WeatherCodeMeta = {
  icon: WeatherIcon;
  condition: string;
};

type LocationConfig = {
  location: string;
  latitude: number;
  longitude: number;
};

export const weatherLocations: Record<string, LocationConfig> = {
  National: { location: "Gold Coast", latitude: -28.0167, longitude: 153.4 },
  Workshop: { location: "Gold Coast", latitude: -28.0167, longitude: 153.4 },
  Brisbane: { location: "Brisbane", latitude: -27.4705, longitude: 153.026 },
  Sydney: { location: "Sydney", latitude: -33.8688, longitude: 151.2093 },
  Melbourne: { location: "Melbourne", latitude: -37.8136, longitude: 144.9631 },
  Adelaide: { location: "Adelaide", latitude: -34.9285, longitude: 138.6007 },
  Perth: { location: "Perth", latitude: -31.9523, longitude: 115.8613 },
  Canberra: { location: "Canberra", latitude: -35.2809, longitude: 149.13 }
};

const fallbackLocation = weatherLocations.National;

export function getWeatherLocation(scope: string) {
  return weatherLocations[scope] || fallbackLocation;
}

export function describeWeatherCode(code: number | null | undefined): WeatherCodeMeta {
  if (code === 0) return { icon: "clear", condition: "Clear" };
  if (code === 1 || code === 2) return { icon: "clear", condition: "Mostly clear" };
  if (code === 3) return { icon: "cloud", condition: "Cloudy" };
  if (code === 45 || code === 48) return { icon: "fog", condition: "Fog" };
  if ([51, 53, 55, 56, 57].includes(code || -1)) return { icon: "drizzle", condition: "Drizzle" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code || -1)) return { icon: "rain", condition: "Rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code || -1)) return { icon: "rain", condition: "Snow / ice" };
  if ([95, 96, 99].includes(code || -1)) return { icon: "storm", condition: "Storm risk" };
  return { icon: "pending", condition: "Pending" };
}

export function getForecastSignal(day: TocWeatherDay) {
  const windy = (day.windMax || 0) >= 45;
  const wet = (day.rainChance || 0) >= 70 || (day.rainTotal || 0) >= 8;
  const storm = day.icon === "storm";

  if (storm) return "Storm risk";
  if (windy && wet) return "Wet and windy";
  if (wet) return "High rain chance";
  if (windy) return "Wind watch";
  return "No severe forecast signal";
}
