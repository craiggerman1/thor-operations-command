import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { allRegions } from "@/lib/access";
import type { AccessRole } from "@/lib/access";

type AuthProfileRow = {
  access_level: AccessRole | "national";
  is_active: boolean;
  profile_regions?: ProfileRegionRow[] | null;
};

type ProfileRegionRow = {
  region?: { name: string } | { name: string }[] | null;
};

export type TocAuthenticatedUser = {
  id: string;
  role: AccessRole;
  regions: string[];
};

export function mapTocRole(role: string): AccessRole {
  if (role === "director") return "director";
  if (role === "admin") return "admin";
  return "manager";
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normaliseRegionsForRole(role: AccessRole, regions: string[]) {
  const cleanRegions = Array.from(new Set(regions.filter(Boolean)));
  if (role === "director") return ["National"];
  if (role === "admin") return Array.from(new Set(["National", ...cleanRegions.filter((region) => region !== "National")]));
  if (cleanRegions.includes("National")) return ["National", ...cleanRegions.filter((region) => region !== "National")];
  return cleanRegions;
}

export async function requireTocRole(request: Request, roles: AccessRole[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 }),
      user: undefined
    };
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!token) {
    return {
      error: NextResponse.json({ error: "Secure admin sign-in is required for this action." }, { status: 401 }),
      user: undefined
    };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return {
      error: NextResponse.json({ error: authError?.message || "Authenticated user could not be confirmed." }, { status: 401 }),
      user: undefined
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("access_level,is_active,profile_regions(region:regions(name))")
    .eq("id", authData.user.id)
    .single();

  if (error || !data) {
    return {
      error: NextResponse.json({ error: error?.message || "TOC user profile was not found." }, { status: 403 }),
      user: undefined
    };
  }

  const profile = data as AuthProfileRow;
  const role = mapTocRole(profile.access_level);
  const profileRegions = (profile.profile_regions || [])
    .map((item) => firstRelated(item.region)?.name)
    .filter(Boolean) as string[];
  const regions = normaliseRegionsForRole(role, profileRegions);
  if (!profile.is_active || !roles.includes(role)) {
    return {
      error: NextResponse.json({ error: "You do not have permission to perform this TOC action." }, { status: 403 }),
      user: undefined
    };
  }

  return {
    user: {
      id: authData.user.id,
      role,
      regions
    },
    error: undefined
  };
}

export async function requireTocUser(request: Request) {
  return requireTocRole(request, ["admin", "director", "manager"]);
}

export function hasNationalAccess(user: TocAuthenticatedUser) {
  return user.role === "admin" || user.regions.includes("National");
}

export function canAccessScope(user: TocAuthenticatedUser, scope: string) {
  if (user.role === "admin") return true;
  if (user.role === "director") return scope === "National";
  return user.regions.includes(scope);
}

function canUseDeveloperScopeOverride(user: TocAuthenticatedUser, scope: string) {
  return process.env.NEXT_PUBLIC_TOC_ENABLE_VIEW_AS === "true" && user.role === "admin" && allRegions.includes(scope);
}

export function getDefaultScopeForUser(user: TocAuthenticatedUser) {
  if (user.role === "admin" || user.role === "director") return "National";
  return user.regions[0] || "Brisbane";
}

export function resolvePermittedScope(user: TocAuthenticatedUser, requestedScope: string | null | undefined) {
  const scope = requestedScope || getDefaultScopeForUser(user);
  return canAccessScope(user, scope) ? scope : getDefaultScopeForUser(user);
}

export async function requireTocNationalAccess(request: Request, options: { allowDirector?: boolean } = {}) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission;

  const user = permission.user;
  if (hasNationalAccess(user) || (options.allowDirector && user.role === "director")) {
    return permission;
  }

  return {
    error: NextResponse.json({ error: "National responsibility is required for this TOC action." }, { status: 403 }),
    user: undefined
  };
}

export async function requireTocScope(request: Request, requestedScope: string | null | undefined) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission;

  const user = permission.user;
  const scope = requestedScope || getDefaultScopeForUser(user);
  if (canAccessScope(user, scope) || canUseDeveloperScopeOverride(user, scope)) {
    return {
      user,
      scope,
      error: undefined
    };
  }

  return {
    error: NextResponse.json({ error: "You do not have permission to view this TOC scope." }, { status: 403 }),
    user: undefined,
    scope: undefined
  };
}
