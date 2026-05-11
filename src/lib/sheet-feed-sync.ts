import { getSupabaseAdminClient } from "@/lib/supabase";
import { normaliseSheetSourceConfig, sheetSourceDefaults, toGoogleSheetCsvUrl } from "@/lib/sheet-source-settings";
import { staffAvailabilitySheet, staffInductionsSheet } from "@/lib/toc-data";
import type { InductionFeed, InductionStatus, StaffAvailabilityFeed, StaffSheetStatus } from "@/lib/toc-data";
import type { SheetSourceConfig, SheetSourceSlug } from "@/lib/sheet-source-settings";

type StaffProfileLink = {
  id: string;
  display_name: string;
  availability_sheet_name: string | null;
  induction_sheet_name: string | null;
};

type RegionRow = {
  id: string;
  name: string;
};

type OperationSiteLink = {
  id: string;
  client_name: string;
  site_name: string;
};

function settingsKey(slug: SheetSourceSlug) {
  return `sheet_source_settings_${slug}`;
}

function lowerKey(value: string) {
  return value.trim().toLowerCase();
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

function normalizeAvailabilityStatus(value: string): StaffSheetStatus {
  const trimmed = value.trim();
  if (trimmed === "Available") return "Available";
  if (trimmed === "Not Available") return "Not Available";
  return "";
}

function normalizeInductionStatus(value: string): InductionStatus {
  const trimmed = value.trim();
  if (trimmed === "Inducted") return "Inducted";
  if (trimmed === "Not Inducted") return "Not Inducted";
  if (trimmed === "Expired") return "Expired";
  if (trimmed === "Expiring Soon") return "Expiring Soon";
  if (trimmed === "Expiring This Month") return "Expiring This Month";
  return "";
}

function nowBrisbaneLabel() {
  return new Date().toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" });
}

export function scopedEmptyAvailabilityFeed(region: string): StaffAvailabilityFeed {
  return {
    ...staffAvailabilitySheet,
    sourceName: `${region} availability source required`,
    spreadsheetUrl: "",
    lastRead: "Source required",
    staff: []
  };
}

export function scopedEmptyInductionFeed(region: string): InductionFeed {
  return {
    ...staffInductionsSheet,
    sourceName: `${region} induction source required`,
    spreadsheetUrl: "",
    lastRead: "Source required",
    sites: [],
    staff: []
  };
}

export async function readSheetSourceConfig(slug: SheetSourceSlug): Promise<SheetSourceConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return sheetSourceDefaults[slug];

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", settingsKey(slug))
    .maybeSingle();

  if (error || !data?.value) return sheetSourceDefaults[slug];
  return normaliseSheetSourceConfig(slug, data.value as Record<string, unknown>);
}

async function readSheetCsv(config: SheetSourceConfig) {
  const response = await fetch(toGoogleSheetCsvUrl(config.spreadsheetUrl, Date.now()), { cache: "no-store" });
  if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status}`);
  return response.text();
}

async function buildProfileMap(field: "availability_sheet_name" | "induction_sheet_name") {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();
  const { data } = await supabase.from("staff_profiles").select(`id,display_name,${field}`);
  const profiles = new Map<string, string>();
  ((data || []) as StaffProfileLink[]).forEach((profile) => {
    profiles.set(lowerKey(profile.display_name), profile.id);
    const sheetName = profile[field];
    if (sheetName) profiles.set(lowerKey(sheetName), profile.id);
  });
  return profiles;
}

async function resolveRegion(regionName: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;
  const { data } = await supabase.from("regions").select("id,name").eq("name", regionName).limit(1);
  return ((data || []) as RegionRow[])[0] || null;
}

export async function syncAvailabilitySheetToDatabase(config?: SheetSourceConfig) {
  config = config || await readSheetSourceConfig("staff-availability");
  if (!config.connected) return { connected: false, cachedRows: 0, feed: scopedEmptyAvailabilityFeed(config.region), config };

  const csv = await readSheetCsv(config);
  const rows = parseCsv(csv);
  const staffRows = rows.slice(2).filter((row) => row[0]?.trim());
  const staff = staffRows.map((row) => ({
    name: row[0].trim(),
    availability: staffAvailabilitySheet.days.map((_, dayIndex) => {
      const startColumn = 1 + dayIndex * staffAvailabilitySheet.windows.length;
      return staffAvailabilitySheet.windows.map((_, windowIndex) => normalizeAvailabilityStatus(row[startColumn + windowIndex] || ""));
    })
  }));

  const feed: StaffAvailabilityFeed = {
    ...staffAvailabilitySheet,
    sourceName: config.sourceName || staffAvailabilitySheet.sourceName,
    spreadsheetUrl: config.spreadsheetUrl || staffAvailabilitySheet.spreadsheetUrl,
    lastRead: nowBrisbaneLabel(),
    staff
  };

  const supabase = getSupabaseAdminClient();
  const region = await resolveRegion(config.region);
  if (!supabase || !region || !staff.length) return { connected: true, cachedRows: 0, feed, config };

  const profiles = await buildProfileMap("availability_sheet_name");
  const now = new Date().toISOString();
  const cacheRows = staff.flatMap((person) => staffAvailabilitySheet.days.flatMap((dayName, dayIndex) => (
    staffAvailabilitySheet.windows.map((windowName, windowIndex) => ({
      staff_profile_id: profiles.get(lowerKey(person.name)) || null,
      staff_name: person.name,
      region_id: region.id,
      source_slug: "staff-availability",
      source_name: feed.sourceName,
      day_name: dayName,
      window_name: windowName,
      status: person.availability[dayIndex]?.[windowIndex] || "",
      source_updated_at: now,
      updated_at: now
    }))
  )));

  const { error } = await supabase
    .from("staff_availability_cache")
    .upsert(cacheRows, { onConflict: "staff_name,region_id,source_slug,day_name,window_name" });
  if (error) throw error;

  return { connected: true, cachedRows: cacheRows.length, feed, config };
}

export async function syncInductionSheetToDatabase(config?: SheetSourceConfig) {
  config = config || await readSheetSourceConfig("inductions");
  if (!config.connected) return { connected: false, cachedRows: 0, feed: scopedEmptyInductionFeed(config.region), config };

  const csv = await readSheetCsv(config);
  const rows = parseCsv(csv);
  const siteRow = rows[0] || [];
  const sites = siteRow
    .slice(1)
    .filter((_, index) => index % 2 === 0)
    .map((name) => ({ name: name.trim().replace(/\s+Status$/i, ""), region: config.region }))
    .filter((site) => site.name);
  const staffRows = rows.slice(1).filter((row) => {
    const staffName = row[0]?.trim() || "";
    return staffName && !/^staff\b/i.test(staffName);
  });
  const staff = staffRows.map((row) => ({
    name: row[0].trim(),
    inductions: sites.map((site, index) => {
      const statusColumn = 1 + index * 2;
      return {
        site: site.name,
        status: normalizeInductionStatus(row[statusColumn] || ""),
        expiry: (row[statusColumn + 1] || "").trim()
      };
    })
  }));

  const feed: InductionFeed = {
    ...staffInductionsSheet,
    sourceName: config.sourceName || staffInductionsSheet.sourceName,
    spreadsheetUrl: config.spreadsheetUrl || staffInductionsSheet.spreadsheetUrl,
    lastRead: nowBrisbaneLabel(),
    sites,
    staff
  };

  const supabase = getSupabaseAdminClient();
  const region = await resolveRegion(config.region);
  if (!supabase || !region || !staff.length) return { connected: true, cachedRows: 0, feed, config };

  const [profiles, { data: siteRows }] = await Promise.all([
    buildProfileMap("induction_sheet_name"),
    supabase.from("operation_sites").select("id,client_name,site_name")
  ]);
  const siteMap = new Map<string, string>();
  ((siteRows || []) as OperationSiteLink[]).forEach((site) => {
    siteMap.set(lowerKey(site.site_name), site.id);
    siteMap.set(lowerKey(`${site.client_name} - ${site.site_name}`), site.id);
    siteMap.set(lowerKey(`${site.client_name} ${site.site_name}`), site.id);
  });

  const now = new Date().toISOString();
  const knownSiteNames = new Set(sites.map((site) => site.name));
  const cacheRows = staff.flatMap((person) => person.inductions
    .filter((induction) => knownSiteNames.has(induction.site))
    .map((induction) => ({
      staff_profile_id: profiles.get(lowerKey(person.name)) || null,
      staff_name: person.name,
      site_id: siteMap.get(lowerKey(induction.site)) || null,
      site_name: induction.site,
      region_id: region.id,
      source_slug: "inductions",
      source_name: feed.sourceName,
      status: induction.status || "",
      expiry: induction.expiry || "",
      source_updated_at: now,
      updated_at: now
    })));

  const { error } = await supabase
    .from("staff_induction_cache")
    .upsert(cacheRows, { onConflict: "staff_name,site_name,region_id,source_slug" });
  if (error) throw error;

  return { connected: true, cachedRows: cacheRows.length, feed, config };
}
