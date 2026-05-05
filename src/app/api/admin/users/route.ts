import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { AccessRole } from "@/lib/access";

type ProfileRegionRow = {
  region?: { name: string } | { name: string }[] | null;
};

type ProfileRow = {
  id: string;
  display_name: string;
  email: string | null;
  user_reference: string | null;
  access_level: AccessRole | "national";
  is_active: boolean;
  profile_regions?: ProfileRegionRow[] | null;
};

type RegionRow = {
  id: string;
  name: string;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function mapRole(role: string): AccessRole {
  if (role === "director") return "director";
  if (role === "admin") return "admin";
  return "manager";
}

function normaliseRegionsForRole(role: AccessRole, regions: string[]) {
  const cleanRegions = Array.from(new Set(regions.filter(Boolean)));
  if (role === "director") return ["National"];
  if (role === "admin") return Array.from(new Set(["National", ...cleanRegions.filter((region) => region !== "National")]));
  if (cleanRegions.includes("National")) return ["National", ...cleanRegions.filter((region) => region !== "National")];
  return cleanRegions.length ? cleanRegions : ["Brisbane"];
}

function mapUser(row: ProfileRow) {
  const regions = (row.profile_regions || [])
    .map((item) => firstRelated(item.region)?.name)
    .filter(Boolean) as string[];
  const role = mapRole(row.access_level);
  const normalisedRegions = normaliseRegionsForRole(role, regions);

  return {
    id: row.id,
    name: row.display_name,
    email: row.email || "",
    reference: row.user_reference || "No reference supplied",
    role,
    regions: normalisedRegions,
    status: row.is_active ? "Active" : "Disabled"
  };
}

async function getRegionLookup() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();

  const { data, error } = await supabase.from("regions").select("id,name").eq("is_active", true);
  if (error) throw error;
  return new Map(((data as RegionRow[] | null) || []).map((region) => [region.name, region.id]));
}

async function saveProfileRegions(profileId: string, regions: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const regionLookup = await getRegionLookup();
  const regionRows = regions
    .map((name) => regionLookup.get(name))
    .filter(Boolean)
    .map((regionId) => ({ profile_id: profileId, region_id: regionId }));

  const { error: deleteError } = await supabase.from("profile_regions").delete().eq("profile_id", profileId);
  if (deleteError) throw deleteError;

  if (regionRows.length) {
    const { error: insertError } = await supabase.from("profile_regions").insert(regionRows);
    if (insertError) throw insertError;
  }
}

async function readUsers() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { users: [], connected: false, error: "Supabase server key is not configured." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,email,user_reference,access_level,is_active,profile_regions(region:regions(name))")
    .order("created_at", { ascending: false });

  if (error) return { users: [], connected: false, error: error.message };
  return { users: ((data as ProfileRow[] | null) || []).map(mapUser), connected: true };
}

export async function GET() {
  const result = await readUsers();
  return NextResponse.json(result, { status: result.connected ? 200 : 503 });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "create") {
    const displayName = String(payload.name || "").trim();
    if (!displayName) return NextResponse.json({ error: "User name is required." }, { status: 400 });

    const role = mapRole(payload.role || "manager");
    const regions = normaliseRegionsForRole(role, (payload.regions || []) as string[]);

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        display_name: displayName,
        email: typeof payload.email === "string" ? payload.email.trim() || null : null,
        user_reference: payload.reference || "No reference supplied",
        access_level: role,
        is_active: true
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await saveProfileRegions(data.id, regions);
    return GET();
  }

  if (action === "update") {
    const id = payload.id;
    if (!id) return NextResponse.json({ error: "User id is required." }, { status: 400 });

    const updates: Record<string, string | boolean> = { updated_at: new Date().toISOString() };
    if (typeof payload.name === "string") updates.display_name = payload.name;
    if (typeof payload.email === "string") updates.email = payload.email.trim();
    if (typeof payload.reference === "string") updates.user_reference = payload.reference;
    if (typeof payload.role === "string") updates.access_level = mapRole(payload.role);
    if (typeof payload.status === "string") updates.is_active = payload.status === "Active";

    const { error } = await supabase.from("profiles").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (Array.isArray(payload.regions)) {
      const role = mapRole(payload.role || "manager");
      await saveProfileRegions(id, normaliseRegionsForRole(role, payload.regions));
    }

    return GET();
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "User id is required." }, { status: 400 });
    const { error: regionDeleteError } = await supabase.from("profile_regions").delete().eq("profile_id", payload.id);
    if (regionDeleteError) return NextResponse.json({ error: regionDeleteError.message }, { status: 500 });
    const { error } = await supabase.from("profiles").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET();
  }

  return NextResponse.json({ error: "Unsupported admin user action." }, { status: 400 });
}
