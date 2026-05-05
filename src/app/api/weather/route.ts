import { NextResponse } from "next/server";
import { describeWeatherCode, getWeatherLocation } from "@/lib/weather";
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

type BomWarningItem = {
  title: string;
  link: string | null;
  issuedAt: string | null;
};

const bomWarningFeeds: Record<string, string> = {
  National: "https://www.bom.gov.au/fwo/IDZ00056.warnings_qld.xml",
  Workshop: "https://www.bom.gov.au/fwo/IDZ00056.warnings_qld.xml",
  Brisbane: "https://www.bom.gov.au/fwo/IDZ00056.warnings_qld.xml",
  Sydney: "https://www.bom.gov.au/fwo/IDZ00054.warnings_nsw.xml",
  Canberra: "https://www.bom.gov.au/fwo/IDZ00054.warnings_nsw.xml",
  Melbourne: "https://www.bom.gov.au/fwo/IDZ00059.warnings_vic.xml",
  Adelaide: "https://www.bom.gov.au/fwo/IDZ00057.warnings_sa.xml",
  Perth: "https://www.bom.gov.au/fwo/IDZ00060.warnings_wa.xml"
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

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractXmlTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXmlText(match[1]) : null;
}

function parseBomWarnings(xml: string): BomWarningItem[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map((match) => ({
      title: extractXmlTag(match[1], "title") || "",
      link: extractXmlTag(match[1], "link"),
      issuedAt: extractXmlTag(match[1], "pubDate")
    }))
    .filter((item) => item.title && !/no warnings current/i.test(item.title));
}

async function getBomWarning(scope: string) {
  const feed = bomWarningFeeds[scope] || bomWarningFeeds.National;

  try {
    const response = await fetch(feed, {
      next: { revalidate: 600 },
      headers: {
        "User-Agent": "Thor Operations Command weather warning monitor"
      }
    });

    if (!response.ok) {
      return {
        active: false,
        message: "BOM warning feed unavailable",
        source: "BOM",
        link: feed
      };
    }

    const warnings = parseBomWarnings(await response.text());
    const firstWarning = warnings[0];

    if (!firstWarning) {
      return {
        active: false,
        message: "BOM: No current warnings",
        source: "BOM",
        link: feed
      };
    }

    return {
      active: true,
      message: `BOM: ${firstWarning.title}${warnings.length > 1 ? ` +${warnings.length - 1} more` : ""}`,
      source: "BOM",
      link: firstWarning.link || feed
    };
  } catch {
    return {
      active: false,
      message: "BOM warning feed unavailable",
      source: "BOM",
      link: feed
    };
  }
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
    const bomWarning = await getBomWarning(scope);
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
        active: bomWarning.active,
        message: bomWarning.message,
        source: bomWarning.source,
        link: bomWarning.link
      }
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Weather source unavailable" }, { status: 502 });
  }
}
