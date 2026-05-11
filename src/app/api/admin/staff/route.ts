import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocRole } from "@/lib/toc-auth";

type RegionRow = {
  id: string;
  name: string;
};

type StaffProfileRow = {
  id: string;
  display_name: string;
  preferred_name: string | null;
  role: string;
  status: "active" | "inactive" | "watch";
  primary_region_id: string | null;
  skills: string[] | null;
  reliability_notes: string | null;
  availability_sheet_name: string | null;
  induction_sheet_name: string | null;
  contact_mobile: string | null;
  contact_whatsapp: string | null;
  emergency_contact: Record<string, unknown> | null;
  contact_visible_to_odin: boolean | null;
  updated_at: string | null;
};

type StaffRegionLinkRow = {
  staff_profile_id: string;
  region_id: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedStatuses = ["active", "inactive", "watch"];
const allowedStaffRegions = ["Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];
const allowedSkills = ["Wash Hand", "Driver", "Team Leader"];

function isUuid(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value);
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function cleanStaffRegions(value: unknown, primaryRegion: string) {
  const regions = cleanArray(value).filter((region) => allowedStaffRegions.includes(region));
  const primary = allowedStaffRegions.includes(primaryRegion) ? primaryRegion : regions[0] || "Brisbane";
  return Array.from(new Set([primary, ...regions]));
}

function cleanStaffSkills(value: unknown) {
  const skills = cleanArray(value);
  return allowedSkills.filter((skill) => skills.includes(skill));
}

function cleanJsonObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function regionLookup() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();
  const { data, error } = await supabase.from("regions").select("id,name").eq("is_active", true);
  if (error) throw error;
  return new Map(((data as RegionRow[] | null) || []).map((region) => [region.name, region.id]));
}

async function saveStaffRegions(staffId: string, regions: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");
  const lookup = await regionLookup();
  const regionRows = regions
    .filter((region) => region !== "National")
    .map((region) => lookup.get(region))
    .filter(Boolean)
    .map((regionId) => ({ staff_profile_id: staffId, region_id: regionId }));

  const { error: deleteError } = await supabase.from("staff_profile_regions").delete().eq("staff_profile_id", staffId);
  if (deleteError) throw deleteError;
  if (regionRows.length) {
    const { error: insertError } = await supabase.from("staff_profile_regions").insert(regionRows);
    if (insertError) throw insertError;
  }
}

async function resolveRegionId(regionName: string) {
  const lookup = await regionLookup();
  return lookup.get(regionName) || null;
}

async function readStaff() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { connected: false, source: "database", error: "Supabase server key is not configured.", staff: [] };
  }

  const [profilesResult, regionsResult, linksResult] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("id,display_name,preferred_name,role,status,primary_region_id,skills,reliability_notes,availability_sheet_name,induction_sheet_name,contact_mobile,contact_whatsapp,emergency_contact,contact_visible_to_odin,updated_at")
      .order("display_name", { ascending: true }),
    supabase
      .from("regions")
      .select("id,name")
      .eq("is_active", true),
    supabase
      .from("staff_profile_regions")
      .select("staff_profile_id,region_id")
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (regionsResult.error) throw regionsResult.error;
  if (linksResult.error) throw linksResult.error;

  const regionsById = ((regionsResult.data || []) as RegionRow[]).reduce<Record<string, string>>((lookup, region) => {
    lookup[region.id] = region.name;
    return lookup;
  }, {});
  const linksByStaff = ((linksResult.data || []) as StaffRegionLinkRow[]).reduce<Record<string, string[]>>((lookup, link) => {
    const regionName = regionsById[link.region_id];
    if (regionName) lookup[link.staff_profile_id] = [...(lookup[link.staff_profile_id] || []), regionName];
    return lookup;
  }, {});

  const staff = ((profilesResult.data || []) as StaffProfileRow[]).map((profile) => {
    const primaryRegion = profile.primary_region_id ? regionsById[profile.primary_region_id] : null;
    const regions = Array.from(new Set([...(linksByStaff[profile.id] || []), ...(primaryRegion ? [primaryRegion] : [])]));
    return {
      id: profile.id,
      name: profile.display_name,
      preferredName: profile.preferred_name,
      regions: regions.length ? regions : ["Unassigned"],
      primaryRegion: primaryRegion || regions[0] || "Unassigned",
      role: profile.role,
      status: profile.status,
      skills: profile.skills || [],
      reliabilityNotes: profile.reliability_notes || "",
      preferredWindows: {},
      availabilitySheetName: profile.availability_sheet_name || profile.display_name,
      inductionSheetName: profile.induction_sheet_name || profile.display_name,
      availability: { availableWindows: 0, totalWindows: 0 },
      inductions: { eligibleSites: [] },
      contact: {
        mobile: profile.contact_mobile,
        whatsapp: profile.contact_whatsapp,
        emergencyContact: profile.emergency_contact || {}
      },
      contactVisibleToOdin: profile.contact_visible_to_odin !== false,
      source: "database" as const,
      updatedAt: profile.updated_at
    };
  });

  return { connected: true, source: "database" as const, error: null, staff };
}

export async function GET(request: Request) {
  const permission = await requireTocRole(request, ["admin"]);
  if (permission.error) return permission.error;

  const result = await readStaff();
  return NextResponse.json(result, { status: result.connected || result.staff.length ? 200 : 503 });
}

export async function POST(request: Request) {
  const permission = await requireTocRole(request, ["admin"]);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));
  const action = cleanString(payload.action) || "create";

  try {
    if (action === "create") {
      const displayName = cleanString(payload.name || payload.displayName);
      if (!displayName) return NextResponse.json({ error: "Staff name is required." }, { status: 400 });

      const regions = cleanStaffRegions(payload.regions, cleanString(payload.primaryRegion));
      const primaryRegion = regions[0] || "Brisbane";
      const primaryRegionId = await resolveRegionId(primaryRegion);
      if (!primaryRegionId) return NextResponse.json({ error: `Primary region ${primaryRegion} is not mapped in the TOC regions table.` }, { status: 400 });
      const { data, error } = await supabase.from("staff_profiles").insert({
        display_name: displayName,
        preferred_name: cleanString(payload.preferredName) || null,
        role: cleanString(payload.role) || "Wash Hand",
        status: allowedStatuses.includes(cleanString(payload.status)) ? cleanString(payload.status) : "active",
        primary_region_id: primaryRegionId,
        skills: cleanStaffSkills(payload.skills),
        preferred_windows: cleanJsonObject(payload.preferredWindows),
        reliability_notes: cleanString(payload.reliabilityNotes),
        availability_sheet_name: cleanString(payload.availabilitySheetName || displayName.toUpperCase()),
        induction_sheet_name: cleanString(payload.inductionSheetName || displayName.toUpperCase()),
        contact_mobile: cleanString(payload.mobile) || null,
        contact_whatsapp: cleanString(payload.whatsapp) || null,
        emergency_contact: cleanJsonObject(payload.emergencyContact),
        contact_visible_to_odin: payload.contactVisibleToOdin !== false
      }).select("id").single();

      if (error) throw error;
      await saveStaffRegions(data.id, regions);
      await logTocAudit({ actor: permission.user, action: "admin.staff.create", entityTable: "staff_profiles", entityId: data.id, scope: regions.join(", "), details: { displayName, regions } });
      return readStaff().then((result) => NextResponse.json(result));
    }

    if (action === "update") {
      if (!isUuid(payload.id)) return NextResponse.json({ error: "Staff id is required." }, { status: 400 });
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof payload.name === "string" || typeof payload.displayName === "string") updates.display_name = cleanString(payload.name || payload.displayName);
      if (typeof payload.preferredName === "string") updates.preferred_name = cleanString(payload.preferredName) || null;
      if (typeof payload.role === "string") updates.role = cleanString(payload.role) || "Wash Hand";
      if (typeof payload.status === "string" && allowedStatuses.includes(cleanString(payload.status))) updates.status = cleanString(payload.status);
      if (Array.isArray(payload.skills) || typeof payload.skills === "string") updates.skills = cleanStaffSkills(payload.skills);
      if (typeof payload.reliabilityNotes === "string") updates.reliability_notes = cleanString(payload.reliabilityNotes);
      if (typeof payload.availabilitySheetName === "string") updates.availability_sheet_name = cleanString(payload.availabilitySheetName) || null;
      if (typeof payload.inductionSheetName === "string") updates.induction_sheet_name = cleanString(payload.inductionSheetName) || null;
      if (typeof payload.mobile === "string") updates.contact_mobile = cleanString(payload.mobile) || null;
      if (typeof payload.whatsapp === "string") updates.contact_whatsapp = cleanString(payload.whatsapp) || null;
      if (payload.emergencyContact !== undefined) updates.emergency_contact = cleanJsonObject(payload.emergencyContact);
      if (payload.preferredWindows !== undefined) updates.preferred_windows = cleanJsonObject(payload.preferredWindows);
      if (typeof payload.contactVisibleToOdin === "boolean") updates.contact_visible_to_odin = payload.contactVisibleToOdin;

      if (typeof payload.primaryRegion === "string") {
        const primaryRegion = cleanString(payload.primaryRegion);
        const primaryRegionId = await resolveRegionId(primaryRegion);
        if (!primaryRegionId) return NextResponse.json({ error: `Primary region ${primaryRegion} is not mapped in the TOC regions table.` }, { status: 400 });
        updates.primary_region_id = primaryRegionId;
      }

      const { data, error } = await supabase.from("staff_profiles").update(updates).eq("id", payload.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Staff entity was not found in the database." }, { status: 404 });
      const regions = cleanStaffRegions(payload.regions, cleanString(payload.primaryRegion));
      if (Array.isArray(payload.regions)) await saveStaffRegions(payload.id, regions);
      await logTocAudit({ actor: permission.user, action: "admin.staff.update", entityTable: "staff_profiles", entityId: payload.id, scope: regions.join(", "), details: { changedFields: Object.keys(updates).filter((field) => field !== "updated_at") } });
      return readStaff().then((result) => NextResponse.json(result));
    }

    if (action === "delete") {
      if (!isUuid(payload.id)) return NextResponse.json({ error: "Staff id is required." }, { status: 400 });
      const { error } = await supabase.from("staff_profiles").delete().eq("id", payload.id);
      if (error) throw error;
      await logTocAudit({ actor: permission.user, action: "admin.staff.delete", entityTable: "staff_profiles", entityId: payload.id, details: { name: payload.name || null } });
      return readStaff().then((result) => NextResponse.json(result));
    }

    return NextResponse.json({ error: "Unsupported staff admin action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Staff admin request failed." }, { status: 500 });
  }
}
