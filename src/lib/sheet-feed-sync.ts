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

function settingsKey(slug: SheetSourceSlug, region?: string) {
  return region ? `sheet_source_settings_${slug}_${region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : `sheet_source_settings_${slug}`;
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

function brisbaneDateTimeLabel(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" });
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

export async function readSheetSourceConfig(slug: SheetSourceSlug, region?: string): Promise<SheetSourceConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return region ? { ...sheetSourceDefaults[slug], region } : sheetSourceDefaults[slug];

  const regionKey = region ? settingsKey(slug, region) : settingsKey(slug);
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", regionKey)
    .maybeSingle();

  if (!error && data?.value) return normaliseSheetSourceConfig(slug, data.value as Record<string, unknown>);

  if (region) {
    const { data: globalData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", settingsKey(slug))
      .maybeSingle();
    if (globalData?.value) {
      const globalConfig = normaliseSheetSourceConfig(slug, globalData.value as Record<string, unknown>);
      if (globalConfig.region === region) return globalConfig;
    }
  }

  return region ? { ...sheetSourceDefaults[slug], region } : sheetSourceDefaults[slug];
}

export async function readCachedAvailabilityFeed(regionName: string, config?: SheetSourceConfig): Promise<StaffAvailabilityFeed | null> {
  const supabase = getSupabaseAdminClient();
  const region = await resolveRegion(regionName);
  if (!supabase || !region) return null;

  const { data, error } = await supabase
    .from("staff_availability_cache")
    .select("staff_name,day_name,window_name,status,source_name,source_updated_at,updated_at")
    .eq("region_id", region.id)
    .eq("source_slug", "staff-availability")
    .order("staff_name", { ascending: true });

  if (error || !data?.length) return null;

  const rows = data as Array<{
    staff_name: string;
    day_name: string;
    window_name: string;
    status: string;
    source_name: string | null;
    source_updated_at: string | null;
    updated_at: string | null;
  }>;
  const staffMap = new Map<string, StaffSheetStatus[][]>();

  rows.forEach((row) => {
    const staffName = row.staff_name?.trim();
    if (!staffName) return;
    if (!staffMap.has(staffName)) {
      staffMap.set(staffName, staffAvailabilitySheet.days.map(() => staffAvailabilitySheet.windows.map(() => "" as StaffSheetStatus)));
    }
    const dayIndex = staffAvailabilitySheet.days.findIndex((day) => day.toLowerCase() === String(row.day_name || "").toLowerCase());
    const windowIndex = staffAvailabilitySheet.windows.findIndex((windowName) => windowName.toLowerCase() === String(row.window_name || "").toLowerCase());
    if (dayIndex >= 0 && windowIndex >= 0) {
      staffMap.get(staffName)![dayIndex][windowIndex] = normalizeAvailabilityStatus(row.status || "");
    }
  });

  const latestUpdate = rows
    .map((row) => row.source_updated_at || row.updated_at || "")
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    ...staffAvailabilitySheet,
    sourceName: config?.sourceName || rows[0]?.source_name || `${regionName} cached availability`,
    spreadsheetUrl: config?.spreadsheetUrl || staffAvailabilitySheet.spreadsheetUrl,
    lastRead: latestUpdate ? `Cached ${brisbaneDateTimeLabel(latestUpdate)}` : "Cached availability",
    staff: Array.from(staffMap.entries()).map(([name, availability]) => ({ name, availability }))
  };
}

export async function readCachedInductionFeed(regionName: string, config?: SheetSourceConfig): Promise<InductionFeed | null> {
  const supabase = getSupabaseAdminClient();
  const region = await resolveRegion(regionName);
  if (!supabase || !region) return null;

  const { data, error } = await supabase
    .from("staff_induction_cache")
    .select("staff_name,site_name,status,expiry,source_name,source_updated_at,updated_at")
    .eq("region_id", region.id)
    .eq("source_slug", "inductions")
    .order("staff_name", { ascending: true });

  if (error || !data?.length) return null;

  const rows = data as Array<{
    staff_name: string;
    site_name: string;
    status: string;
    expiry: string | null;
    source_name: string | null;
    source_updated_at: string | null;
    updated_at: string | null;
  }>;
  const siteNames = Array.from(new Set(rows.map((row) => row.site_name?.trim()).filter(Boolean)));
  const staffMap = new Map<string, { site: string; status: InductionStatus; expiry: string }[]>();

  rows.forEach((row) => {
    const staffName = row.staff_name?.trim();
    const siteName = row.site_name?.trim();
    if (!staffName || !siteName) return;
    const inductions = staffMap.get(staffName) || [];
    inductions.push({
      site: siteName,
      status: normalizeInductionStatus(row.status || ""),
      expiry: row.expiry || ""
    });
    staffMap.set(staffName, inductions);
  });

  const latestUpdate = rows
    .map((row) => row.source_updated_at || row.updated_at || "")
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    ...staffInductionsSheet,
    sourceName: config?.sourceName || rows[0]?.source_name || `${regionName} cached inductions`,
    spreadsheetUrl: config?.spreadsheetUrl || staffInductionsSheet.spreadsheetUrl,
    lastRead: latestUpdate ? `Cached ${brisbaneDateTimeLabel(latestUpdate)}` : "Cached inductions",
    sites: siteNames.map((name) => ({ name, region: regionName })),
    staff: Array.from(staffMap.entries()).map(([name, inductions]) => ({ name, inductions }))
  };
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
  if (error) {
    return { connected: true, cachedRows: 0, feed, config, cacheError: error.message };
  }

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
  if (error) {
    return { connected: true, cachedRows: 0, feed, config, cacheError: error.message };
  }

  return { connected: true, cachedRows: cacheRows.length, feed, config };
}
