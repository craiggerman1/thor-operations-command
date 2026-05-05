import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { normaliseSheetSourceConfig, sheetSourceDefaults } from "@/lib/sheet-source-settings";
import { staffAvailabilitySheet } from "@/lib/toc-data";
import type { StaffAvailabilityFeed, StaffSheetStatus } from "@/lib/toc-data";
import { requireTocScope } from "@/lib/toc-auth";

export const dynamic = "force-dynamic";

const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/1dFwTlBmOUPeq21LQdv6AzHFztuLDRC-j7io-B_1zWx0/gviz/tq?tqx=out:csv&gid=0";
const settingsKey = "sheet_source_settings_staff-availability";

async function readSourceConfig() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return sheetSourceDefaults["staff-availability"];

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", settingsKey)
    .maybeSingle();

  if (error || !data?.value) return sheetSourceDefaults["staff-availability"];
  return normaliseSheetSourceConfig("staff-availability", data.value as Record<string, unknown>);
}

function scopedEmptyFeed(region: string): StaffAvailabilityFeed {
  return {
    ...staffAvailabilitySheet,
    sourceName: `${region} availability source required`,
    spreadsheetUrl: "",
    lastRead: "Source required",
    staff: []
  };
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeStatus(value: string): StaffSheetStatus {
  const trimmed = value.trim();
  if (trimmed === "Available") return "Available";
  if (trimmed === "Not Available") return "Not Available";
  return "";
}

export async function GET(request: Request) {
  const requestedScope = new URL(request.url).searchParams.get("scope") || "National";
  const scopePermission = await requireTocScope(request, requestedScope);
  if (scopePermission.error) return scopePermission.error;

  const config = await readSourceConfig();

  if (!config.connected || scopePermission.scope !== config.region) {
    return NextResponse.json(scopedEmptyFeed(scopePermission.scope));
  }

  try {
    const response = await fetch(sheetCsvUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status}`);

    const csv = await response.text();
    const rows = parseCsv(csv);
    const staffRows = rows.slice(2).filter((row) => row[0]?.trim());
    const staff = staffRows.map((row) => ({
      name: row[0].trim(),
      availability: staffAvailabilitySheet.days.map((_, dayIndex) => {
        const startColumn = 1 + dayIndex * staffAvailabilitySheet.windows.length;
        return staffAvailabilitySheet.windows.map((_, windowIndex) => normalizeStatus(row[startColumn + windowIndex] || ""));
      })
    }));

    const feed: StaffAvailabilityFeed = {
      ...staffAvailabilitySheet,
      sourceName: config.sourceName || staffAvailabilitySheet.sourceName,
      spreadsheetUrl: config.spreadsheetUrl || staffAvailabilitySheet.spreadsheetUrl,
      lastRead: new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" }),
      staff
    };

    return NextResponse.json(feed);
  } catch {
    return NextResponse.json(staffAvailabilitySheet);
  }
}
