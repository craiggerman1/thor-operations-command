import { staffAvailabilitySheet, type StaffSheetStatus } from "@/lib/toc-data";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { normaliseSheetSourceConfig, sheetSourceDefaults, toGoogleSheetCsvUrl } from "@/lib/sheet-source-settings";
import { readSheetSourceConfig } from "@/lib/sheet-feed-sync";

const availabilitySettingsKey = "sheet_source_settings_staff-availability";
const inductionSettingsKey = "sheet_source_settings_inductions";

type StaffProfileRow = {
  id: string;
  display_name: string;
  preferred_name: string | null;
  role: string;
  status: "active" | "inactive" | "watch";
  primary_region_id: string | null;
  skills: string[] | null;
  preferred_windows: Record<string, unknown> | null;
  reliability_notes: string | null;
  availability_sheet_name: string | null;
  induction_sheet_name: string | null;
  contact_mobile: string | null;
  contact_whatsapp: string | null;
  emergency_contact: Record<string, unknown> | null;
  contact_visible_to_odin: boolean | null;
  updated_at: string | null;
};

type RegionRow = {
  id: string;
  name: string;
  is_active?: boolean;
};

type StaffRegionLinkRow = {
  staff_profile_id: string;
  region_id: string;
};

type LiveAvailabilityStaff = {
  name: string;
  region: string;
  availability: StaffSheetStatus[][];
};

type LiveInductionStaff = {
  name: string;
  region: string;
  inductions: { site: string; status: string; expiry: string }[];
};

type LiveStaffFeeds = {
  availabilityStaff: LiveAvailabilityStaff[];
  inductionSites: { name: string; region: string }[];
  inductionStaff: LiveInductionStaff[];
  availabilitySource: string;
  inductionsSource: string;
};

export type OdinStaffEntity = {
  id: string;
  name: string;
  preferredName: string | null;
  regions: string[];
  primaryRegion: string;
  role: string;
  status: "active" | "inactive" | "watch";
  skills: string[];
  reliabilityNotes: string;
  preferredWindows: Record<string, unknown>;
  availabilitySheetName: string;
  inductionSheetName: string;
  availability: {
    source: string;
    days: string[];
    windows: string[];
    matrix: StaffSheetStatus[][];
    availableWindows: number;
    totalWindows: number;
  };
  inductions: {
    source: string;
    eligibleSites: string[];
    records: { site: string; status: string; expiry: string }[];
  };
  contact?: {
    mobile: string | null;
    whatsapp: string | null;
    emergencyContact: Record<string, unknown>;
  };
  contactVisibleToOdin: boolean;
  source: "database" | "availability_sheet";
  updatedAt: string | null;
};

export type StaffReadResult = {
  connected: boolean;
  source: "database" | "availability_sheet";
  staff: OdinStaffEntity[];
  error: string | null;
  protectedFieldsIncluded: boolean;
};

function titleCaseName(name: string) {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function normalizeInductionStatus(value: string) {
  const trimmed = value.trim();
  if (trimmed === "Inducted") return "Inducted";
  if (trimmed === "Not Inducted") return "Not Inducted";
  if (trimmed === "Expired") return "Expired";
  if (trimmed === "Expiring Soon") return "Expiring Soon";
  if (trimmed === "Expiring This Month") return "Expiring This Month";
  return "";
}

async function readLiveStaffFeeds(): Promise<LiveStaffFeeds> {
  const regions = await readActiveRegionNames();
  const configs = await Promise.all(regions.flatMap((region) => [
    readSheetSourceConfig("staff-availability", region),
    readSheetSourceConfig("inductions", region)
  ]));
  const availabilityConfigs = configs.filter((config) => config.slug === "staff-availability" && config.connected && config.spreadsheetUrl);
  const inductionConfigs = configs.filter((config) => config.slug === "inductions" && config.connected && config.spreadsheetUrl);

  const availabilityResults = await Promise.allSettled(availabilityConfigs.map(async (config) => {
    const response = await fetch(toGoogleSheetCsvUrl(config.spreadsheetUrl, Date.now()), { cache: "no-store" });
    if (!response.ok) return [] as LiveAvailabilityStaff[];
    const rows = parseCsv(await response.text());
    const staffRows = rows.slice(2).filter((row) => row[0]?.trim());
    return staffRows.map((row) => ({
      name: row[0].trim(),
      region: config.region,
      availability: staffAvailabilitySheet.days.map((_, dayIndex) => {
        const startColumn = 1 + dayIndex * staffAvailabilitySheet.windows.length;
        return staffAvailabilitySheet.windows.map((_, windowIndex) => normalizeAvailabilityStatus(row[startColumn + windowIndex] || ""));
      })
    }));
  }));
  const inductionResults = await Promise.allSettled(inductionConfigs.map(async (config) => {
    const response = await fetch(toGoogleSheetCsvUrl(config.spreadsheetUrl, Date.now()), { cache: "no-store" });
    if (!response.ok) return { sites: [] as LiveStaffFeeds["inductionSites"], staff: [] as LiveInductionStaff[] };
    const rows = parseCsv(await response.text());
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
    return {
      sites,
      staff: staffRows.map((row) => ({
        name: row[0].trim(),
        region: config.region,
        inductions: sites.map((site, index) => {
          const statusColumn = 1 + index * 2;
          return {
            site: site.name,
            status: normalizeInductionStatus(row[statusColumn] || ""),
            expiry: (row[statusColumn + 1] || "").trim()
          };
        })
      }))
    };
  }));

  const availabilityStaff = availabilityResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const inductionPayloads = inductionResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const inductionSites = inductionPayloads.flatMap((payload) => payload.sites);
  const inductionStaff = inductionPayloads.flatMap((payload) => payload.staff);

  return {
    availabilityStaff,
    inductionSites,
    inductionStaff,
    availabilitySource: availabilityConfigs.length ? "Regional staff availability sheets" : "Staff Availability Source Required",
    inductionsSource: inductionConfigs.length ? "Regional staff induction sheets" : "Staff Induction Source Required"
  };
}

async function readActiveRegionNames() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return ["Brisbane"];
  const { data, error } = await supabase.from("regions").select("name,is_active").eq("is_active", true).order("name", { ascending: true });
  if (error) return ["Brisbane"];
  const names = ((data || []) as RegionRow[]).map((region) => region.name).filter((name) => name && name !== "National");
  return names.length ? names : ["Brisbane"];
}

async function readAvailabilitySourceConfig() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return sheetSourceDefaults["staff-availability"];

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", availabilitySettingsKey)
    .maybeSingle();

  if (error || !data?.value) return sheetSourceDefaults["staff-availability"];
  return normaliseSheetSourceConfig("staff-availability", data.value as Record<string, unknown>);
}

async function readInductionsSourceConfig() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return sheetSourceDefaults.inductions;

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", inductionSettingsKey)
    .maybeSingle();

  if (error || !data?.value) return sheetSourceDefaults.inductions;
  return normaliseSheetSourceConfig("inductions", data.value as Record<string, unknown>);
}

function availabilityForName(name: string, feeds: LiveStaffFeeds, regions: string[] = []) {
  const matches = feeds.availabilityStaff.filter((staff) => staff.name.toLowerCase() === name.toLowerCase());
  return matches.find((staff) => regions.includes(staff.region)) || matches[0];
}

function inductionsForName(name: string, feeds: LiveStaffFeeds, regions: string[] = []) {
  const matches = feeds.inductionStaff.filter((staff) => staff.name.toLowerCase() === name.toLowerCase());
  return matches.find((staff) => regions.includes(staff.region)) || matches[0];
}

function availabilitySummary(name: string, feeds: LiveStaffFeeds, regions: string[] = []) {
  const match = availabilityForName(name, feeds, regions);
  const matrix = match?.availability || [];
  const totalWindows = matrix.reduce((total, day) => total + day.length, 0);
  const availableWindows = matrix.flat().filter((status) => status === "Available").length;

  return {
    source: feeds.availabilitySource,
    days: staffAvailabilitySheet.days,
    windows: staffAvailabilitySheet.windows,
    matrix,
    availableWindows,
    totalWindows
  };
}

function inductionSummary(name: string, feeds: LiveStaffFeeds, regions: string[] = []) {
  const match = inductionsForName(name, feeds, regions);
  const records = (match?.inductions || []).map((induction) => ({
    site: induction.site,
    status: induction.status || "Unknown",
    expiry: induction.expiry || ""
  }));

  return {
    source: feeds.inductionsSource,
    eligibleSites: records.filter((record) => record.status === "Inducted").map((record) => record.site),
    records
  };
}

function fallbackStaffEntities(includeProtected: boolean, feeds: LiveStaffFeeds): OdinStaffEntity[] {
  const names = Array.from(new Set([
    ...feeds.availabilityStaff.map((staff) => `${staff.region}::${staff.name}`),
    ...feeds.inductionStaff.map((staff) => `${staff.region}::${staff.name}`)
  ])).sort((a, b) => a.localeCompare(b));

  return names.map((key) => {
    const [region, name] = key.split("::");
    return ({
    id: `sheet:${region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: titleCaseName(name),
    preferredName: null,
    regions: [region],
    primaryRegion: region,
    role: "Wash Hand",
    status: "active",
    skills: [],
    reliabilityNotes: "",
    preferredWindows: {},
    availabilitySheetName: name,
    inductionSheetName: name,
    availability: availabilitySummary(name, feeds, [region]),
    inductions: inductionSummary(name, feeds, [region]),
    contact: includeProtected ? { mobile: null, whatsapp: null, emergencyContact: {} } : undefined,
    contactVisibleToOdin: true,
    source: "availability_sheet",
    updatedAt: null
  });
  });
}

export async function readOdinStaffEntities(options: { includeProtected: boolean }): Promise<StaffReadResult> {
  const feeds = await readLiveStaffFeeds();
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      connected: false,
      source: "availability_sheet",
      staff: fallbackStaffEntities(options.includeProtected, feeds),
      error: "Supabase server key is not configured.",
      protectedFieldsIncluded: options.includeProtected
    };
  }

  try {
    const [profilesResult, regionsResult, linksResult] = await Promise.all([
      supabase
        .from("staff_profiles")
        .select("id,display_name,preferred_name,role,status,primary_region_id,skills,preferred_windows,reliability_notes,availability_sheet_name,induction_sheet_name,contact_mobile,contact_whatsapp,emergency_contact,contact_visible_to_odin,updated_at")
        .order("display_name", { ascending: true }),
      supabase
        .from("regions")
        .select("id,name,is_active"),
      supabase
        .from("staff_profile_regions")
        .select("staff_profile_id,region_id")
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (regionsResult.error) throw regionsResult.error;
    if (linksResult.error) throw linksResult.error;

    const profileRows = (profilesResult.data || []) as StaffProfileRow[];
    if (!profileRows.length) {
      return {
        connected: true,
        source: "availability_sheet",
        staff: fallbackStaffEntities(options.includeProtected, feeds),
        error: null,
        protectedFieldsIncluded: options.includeProtected
      };
    }

    const regions = ((regionsResult.data || []) as RegionRow[]).reduce<Record<string, string>>((lookup, region) => {
      if (region.is_active !== false) lookup[region.id] = region.name;
      return lookup;
    }, {});
    const links = (linksResult.data || []) as StaffRegionLinkRow[];
    const regionLinks = links.reduce<Record<string, string[]>>((lookup, link) => {
      const regionName = regions[link.region_id];
      if (regionName) lookup[link.staff_profile_id] = [...(lookup[link.staff_profile_id] || []), regionName];
      return lookup;
    }, {});

    return {
      connected: true,
      source: "database",
      protectedFieldsIncluded: options.includeProtected,
      error: null,
      staff: profileRows.map((profile) => {
        const availabilityName = profile.availability_sheet_name || profile.display_name;
        const inductionName = profile.induction_sheet_name || profile.display_name;
        const primaryRegion = profile.primary_region_id ? regions[profile.primary_region_id] : null;
        const profileRegions = Array.from(new Set([
          ...(regionLinks[profile.id] || []),
          ...(primaryRegion ? [primaryRegion] : [])
        ]));
        const canShowContact = options.includeProtected && profile.contact_visible_to_odin !== false;

        return {
          id: profile.id,
          name: profile.display_name,
          preferredName: profile.preferred_name,
          regions: profileRegions.length ? profileRegions : ["Unassigned"],
          primaryRegion: primaryRegion || profileRegions[0] || "Unassigned",
          role: profile.role,
          status: profile.status,
          skills: profile.skills || [],
          reliabilityNotes: profile.reliability_notes || "",
          preferredWindows: profile.preferred_windows || {},
          availabilitySheetName: availabilityName,
          inductionSheetName: inductionName,
          availability: availabilitySummary(availabilityName, feeds, profileRegions),
          inductions: inductionSummary(inductionName, feeds, profileRegions),
          contact: canShowContact ? {
            mobile: profile.contact_mobile,
            whatsapp: profile.contact_whatsapp,
            emergencyContact: profile.emergency_contact || {}
          } : undefined,
          contactVisibleToOdin: profile.contact_visible_to_odin !== false,
          source: "database",
          updatedAt: profile.updated_at
        };
      })
    };
  } catch (error) {
    return {
      connected: false,
      source: "availability_sheet",
      staff: fallbackStaffEntities(options.includeProtected, feeds),
      error: error instanceof Error ? error.message : "Staff profile table could not be read.",
      protectedFieldsIncluded: options.includeProtected
    };
  }
}

export function isStaffAvailableForJob(staff: OdinStaffEntity, jobDate: string, jobTime: string) {
  const date = new Date(`${jobDate}T00:00:00+10:00`);
  if (Number.isNaN(date.getTime())) return null;
  const hour = Number(String(jobTime || "07:00").split(":")[0]);
  if (hour >= 22) date.setDate(date.getDate() + 1);
  const dayName = date.toLocaleDateString("en-AU", { weekday: "long", timeZone: "Australia/Brisbane" });
  const dayIndex = staffAvailabilitySheet.days.findIndex((day) => day.toLowerCase() === dayName.toLowerCase());
  const windowIndex = hour >= 22 || hour < 6 ? 3 : hour >= 16 ? 2 : hour >= 10 ? 1 : 0;
  const value = staff.availability.matrix[dayIndex]?.[windowIndex];
  return value ? value === "Available" : null;
}

export function isStaffInductedForSite(staff: OdinStaffEntity, site: string) {
  const cleanSite = site.toLowerCase();
  const record = staff.inductions.records.find((induction) => {
    const inductionSite = induction.site.toLowerCase();
    return inductionSite === cleanSite || cleanSite.includes(inductionSite) || inductionSite.includes(cleanSite);
  });

  return record ? record.status === "Inducted" : null;
}
