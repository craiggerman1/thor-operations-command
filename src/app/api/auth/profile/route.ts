import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { mapTocRole } from "@/lib/toc-auth";
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

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normaliseRegionsForRole(role: AccessRole, regions: string[]) {
  const cleanRegions = Array.from(new Set(regions.filter(Boolean)));
  if (role === "director") return ["National"];
  if (role === "admin") return Array.from(new Set(["National", ...cleanRegions.filter((region) => region !== "National")]));
  if (cleanRegions.includes("National")) return ["National", ...cleanRegions.filter((region) => region !== "National")];
  return cleanRegions.length ? cleanRegions : ["Brisbane"];
}

function mapProfile(row: ProfileRow) {
  const regions = (row.profile_regions || [])
    .map((item) => firstRelated(item.region)?.name)
    .filter(Boolean) as string[];
  const role = mapTocRole(row.access_level);
  const assignedRegions = normaliseRegionsForRole(role, regions);

  return {
    id: row.id,
    role,
    label: row.display_name,
    scope: assignedRegions[0] || "National",
    regions: assignedRegions,
    email: row.email || "",
    reference: row.user_reference || "No reference supplied",
    isActive: row.is_active
  };
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!token) return NextResponse.json({ error: "Missing authenticated session token." }, { status: 401 });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || "Authenticated user could not be confirmed." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,email,user_reference,access_level,is_active,profile_regions(region:regions(name))")
    .eq("id", authData.user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "TOC user profile was not found." }, { status: 403 });
  }

  const profile = {
    ...mapProfile(data as ProfileRow),
    mustChangePassword: Boolean(authData.user.app_metadata?.must_change_password)
  };
  if (!profile.isActive) return NextResponse.json({ error: "This TOC user account is disabled." }, { status: 403 });

  return NextResponse.json({ profile });
}
