import { NextResponse } from "next/server";
import { describeWeatherCode, getForecastSignal, getWeatherLocation } from "@/lib/weather";
import type { TocWeatherDay, TocWeatherPayload } from "@/lib/weather";

type OpenMeteoResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    precipitation?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    precipitation_sum?: number[];
    wind_speed_10m_max?: number[];
  };
};

function buildForecast(data: OpenMeteoResponse): TocWeatherDay[] {
  const times = data.daily?.time || [];

  return times.map((date, index) => {
    const meta = describeWeatherCode(data.daily?.weather_code?.[index]);
    return {
      date,
      icon: meta.icon,
      condition: meta.condition,
      maxTemp: data.daily?.temperature_2m_max?.[index] ?? null,
      minTemp: data.daily?.temperature_2m_min?.[index] ?? null,
      rainChance: data.daily?.precipitation_probability_max?.[index] ?? null,
      rainTotal: data.daily?.precipitation_sum?.[index] ?? null,
      windMax: data.daily?.wind_speed_10m_max?.[index] ?? null
    };
  });
}

function isSevereWeatherSignal(signal: string | undefined) {
  return signal === "Storm risk" || signal === "Wet and windy";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "National";
  const location = getWeatherLocation(scope);
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");

  weatherUrl.searchParams.set("latitude", String(location.latitude));
  weatherUrl.searchParams.set("longitude", String(location.longitude));
  weatherUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation");
  weatherUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max");
  weatherUrl.searchParams.set("forecast_days", "16");
  weatherUrl.searchParams.set("timezone", "Australia/Brisbane");
  weatherUrl.searchParams.set("wind_speed_unit", "kmh");

  try {
    const response = await fetch(weatherUrl, {
      next: { revalidate: 600 }
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Weather source unavailable" }, { status: 502 });
    }

    const data = await response.json() as OpenMeteoResponse;
    const currentMeta = describeWeatherCode(data.current?.weather_code);
    const forecast = buildForecast(data);
    const strongestSignal = forecast.map(getForecastSignal).find((signal) => signal !== "No severe forecast signal");
    const payload: TocWeatherPayload = {
      scope,
      location: location.location,
      current: {
        temp: data.current?.temperature_2m ?? null,
        apparentTemp: data.current?.apparent_temperature ?? null,
        wind: data.current?.wind_speed_10m ?? null,
        rain: data.current?.precipitation ?? null,
        icon: currentMeta.icon,
        condition: currentMeta.condition,
        updatedAt: data.current?.time || new Date().toISOString()
      },
      forecast,
      warning: {
        active: isSevereWeatherSignal(strongestSignal),
        message: strongestSignal || "No severe forecast signal"
      }
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Weather source unavailable" }, { status: 502 });
  }
}
