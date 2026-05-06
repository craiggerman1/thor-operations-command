import { staffAvailabilitySheet, staffInductionsSheet, type StaffSheetStatus } from "@/lib/toc-data";
import { getSupabaseAdminClient } from "@/lib/supabase";

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

function availabilityForName(name: string) {
  return staffAvailabilitySheet.staff.find((staff) => staff.name.toLowerCase() === name.toLowerCase());
}

function inductionsForName(name: string) {
  return staffInductionsSheet.staff.find((staff) => staff.name.toLowerCase() === name.toLowerCase());
}

function availabilitySummary(name: string) {
  const match = availabilityForName(name);
  const matrix = match?.availability || [];
  const totalWindows = matrix.reduce((total, day) => total + day.length, 0);
  const availableWindows = matrix.flat().filter((status) => status === "Available").length;

  return {
    source: staffAvailabilitySheet.sourceName,
    days: staffAvailabilitySheet.days,
    windows: staffAvailabilitySheet.windows,
    matrix,
    availableWindows,
    totalWindows
  };
}

function inductionSummary(name: string) {
  const match = inductionsForName(name);
  const records = (match?.inductions || []).map((induction) => ({
    site: induction.site,
    status: induction.status || "Unknown",
    expiry: induction.expiry || ""
  }));

  return {
    source: staffInductionsSheet.sourceName,
    eligibleSites: records.filter((record) => record.status === "Inducted").map((record) => record.site),
    records
  };
}

function fallbackStaffEntities(includeProtected: boolean): OdinStaffEntity[] {
  const names = Array.from(new Set([
    ...staffAvailabilitySheet.staff.map((staff) => staff.name),
    ...staffInductionsSheet.staff.map((staff) => staff.name)
  ])).sort((a, b) => a.localeCompare(b));

  return names.map((name) => ({
    id: `sheet:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: titleCaseName(name),
    preferredName: null,
    regions: ["Brisbane"],
    primaryRegion: "Brisbane",
    role: "Wash Hand",
    status: "active",
    skills: [],
    reliabilityNotes: "",
    preferredWindows: {},
    availabilitySheetName: name,
    inductionSheetName: name,
    availability: availabilitySummary(name),
    inductions: inductionSummary(name),
    contact: includeProtected ? { mobile: null, whatsapp: null, emergencyContact: {} } : undefined,
    source: "availability_sheet",
    updatedAt: null
  }));
}

export async function readOdinStaffEntities(options: { includeProtected: boolean }): Promise<StaffReadResult> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      connected: false,
      source: "availability_sheet",
      staff: fallbackStaffEntities(options.includeProtected),
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
        staff: fallbackStaffEntities(options.includeProtected),
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
          availability: availabilitySummary(availabilityName),
          inductions: inductionSummary(inductionName),
          contact: canShowContact ? {
            mobile: profile.contact_mobile,
            whatsapp: profile.contact_whatsapp,
            emergencyContact: profile.emergency_contact || {}
          } : undefined,
          source: "database",
          updatedAt: profile.updated_at
        };
      })
    };
  } catch (error) {
    return {
      connected: false,
      source: "availability_sheet",
      staff: fallbackStaffEntities(options.includeProtected),
      error: error instanceof Error ? error.message : "Staff profile table could not be read.",
      protectedFieldsIncluded: options.includeProtected
    };
  }
}

export function isStaffAvailableForJob(staff: OdinStaffEntity, jobDate: string, jobTime: string) {
  const date = new Date(`${jobDate}T00:00:00+10:00`);
  if (Number.isNaN(date.getTime())) return null;
  const dayName = date.toLocaleDateString("en-AU", { weekday: "long", timeZone: "Australia/Brisbane" });
  const dayIndex = staffAvailabilitySheet.days.findIndex((day) => day.toLowerCase() === dayName.toLowerCase());
  const hour = Number(String(jobTime || "07:00").split(":")[0]);
  const windowIndex = hour < 6 ? 3 : hour < 12 ? 0 : hour < 18 ? 1 : 2;
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
