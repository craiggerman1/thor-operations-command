import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { mapTocRole, requireTocRole } from "@/lib/toc-auth";
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isUuid(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value);
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
  const role = mapTocRole(row.access_level);
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

export async function GET(request: Request) {
  const permission = await requireTocRole(request, ["admin"]);
  if (permission.error) return permission.error;

  const result = await readUsers();
  return NextResponse.json(result, { status: result.connected ? 200 : 503 });
}

export async function POST(request: Request) {
  const permission = await requireTocRole(request, ["admin"]);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "create") {
    const displayName = String(payload.name || "").trim();
    if (!displayName) return NextResponse.json({ error: "User name is required." }, { status: 400 });

    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    if (!email) return NextResponse.json({ error: "Email address is required for secure TOC login." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Temporary password must be at least 8 characters." }, { status: 400 });

    const role = mapTocRole(payload.role || "manager");
    const regions = normaliseRegionsForRole(role, (payload.regions || []) as string[]);
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        toc_role: role,
        must_change_password: true
      }
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || "Secure auth user could not be created." }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        id: authData.user.id,
        display_name: displayName,
        email,
        user_reference: payload.reference || "No reference supplied",
        access_level: role,
        is_active: true
      })
      .select("id")
      .single();

    if (error) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await saveProfileRegions(data.id, regions);
    await logTocAudit({
      actor: permission.user,
      action: "admin.user.create",
      entityTable: "profiles",
      entityId: data.id,
      scope: regions.includes("National") ? "National" : regions[0],
      details: {
        targetRole: role,
        targetRegions: regions,
        hasEmail: Boolean(email)
      }
    });
    return readUsers().then((result) => NextResponse.json(result, { status: result.connected ? 200 : 503 }));
  }

  if (action === "update") {
    const id = payload.id;
    if (!id) return NextResponse.json({ error: "User id is required." }, { status: 400 });
    if (!isUuid(id)) return NextResponse.json({ error: "This is an old local development user. Please register the user again to create a live database profile." }, { status: 400 });

    const updates: Record<string, string | boolean> = { updated_at: new Date().toISOString() };
    if (typeof payload.name === "string") updates.display_name = payload.name;
    if (typeof payload.email === "string") updates.email = payload.email.trim();
    if (typeof payload.reference === "string") updates.user_reference = payload.reference;
    if (typeof payload.role === "string") updates.access_level = mapTocRole(payload.role);
    if (typeof payload.status === "string") updates.is_active = payload.status === "Active";
    if (typeof payload.password === "string" && payload.password.length > 0 && payload.password.length < 8) {
      return NextResponse.json({ error: "Temporary password must be at least 8 characters." }, { status: 400 });
    }

    const { error } = await supabase.from("profiles").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (typeof payload.role === "string") {
      const { error: roleError } = await supabase.auth.admin.updateUserById(id, {
        app_metadata: {
          toc_role: mapTocRole(payload.role)
        }
      });
      if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 });
    }

    if (typeof payload.password === "string" && payload.password.length >= 8) {
      const { error: passwordError } = await supabase.auth.admin.updateUserById(id, {
        password: payload.password,
        app_metadata: {
          toc_role: typeof payload.role === "string" ? mapTocRole(payload.role) : "manager",
          must_change_password: true
        }
      });
      if (passwordError) return NextResponse.json({ error: passwordError.message }, { status: 500 });
    }

    if (Array.isArray(payload.regions)) {
      const role = mapTocRole(payload.role || "manager");
      await saveProfileRegions(id, normaliseRegionsForRole(role, payload.regions));
    }

    await logTocAudit({
      actor: permission.user,
      action: "admin.user.update",
      entityTable: "profiles",
      entityId: id,
      scope: Array.isArray(payload.regions) && payload.regions.includes("National") ? "National" : undefined,
      details: {
        changedFields: Object.keys(updates).filter((field) => field !== "updated_at"),
        regionsUpdated: Array.isArray(payload.regions),
        passwordResetIssued: typeof payload.password === "string" && payload.password.length >= 8
      }
    });
    return readUsers().then((result) => NextResponse.json(result, { status: result.connected ? 200 : 503 }));
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "User id is required." }, { status: 400 });
    if (!isUuid(payload.id)) return NextResponse.json({ error: "This is an old local development user and is not stored in the live database." }, { status: 400 });
    const { error: regionDeleteError } = await supabase.from("profile_regions").delete().eq("profile_id", payload.id);
    if (regionDeleteError) return NextResponse.json({ error: regionDeleteError.message }, { status: 500 });
    const { error } = await supabase.from("profiles").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase.auth.admin.deleteUser(payload.id);
    await logTocAudit({
      actor: permission.user,
      action: "admin.user.delete",
      entityTable: "profiles",
      entityId: payload.id,
      details: {
        targetUserId: payload.id
      }
    });
    return readUsers().then((result) => NextResponse.json(result, { status: result.connected ? 200 : 503 }));
  }

  return NextResponse.json({ error: "Unsupported admin user action." }, { status: 400 });
}
