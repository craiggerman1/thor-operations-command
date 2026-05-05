import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
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

async function hasActiveAdminProfile() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return true;

  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("access_level", "admin")
    .eq("is_active", true);

  if (error) return true;
  return Boolean(count && count > 0);
}

async function isDevelopmentAdminRequest(request: Request) {
  if (request.headers.get("x-toc-development-session") !== "true") return false;
  if (process.env.TOC_ALLOW_DEVELOPMENT_ADMIN === "true") return true;
  return !(await hasActiveAdminProfile());
}

export async function requireTocRole(request: Request, roles: AccessRole[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 })
    };
  }

  if (roles.includes("admin") && await isDevelopmentAdminRequest(request)) {
    return {
      user: {
        id: "development-admin",
        role: "admin" as AccessRole,
        regions: ["National"]
      }
    };
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!token) {
    return {
      error: NextResponse.json({ error: "Secure admin sign-in is required for this action." }, { status: 401 })
    };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return {
      error: NextResponse.json({ error: authError?.message || "Authenticated user could not be confirmed." }, { status: 401 })
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("access_level,is_active,profile_regions(region:regions(name))")
    .eq("id", authData.user.id)
    .single();

  if (error || !data) {
    return {
      error: NextResponse.json({ error: error?.message || "TOC user profile was not found." }, { status: 403 })
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
      error: NextResponse.json({ error: "You do not have permission to perform this TOC action." }, { status: 403 })
    };
  }

  return {
    user: {
      id: authData.user.id,
      role,
      regions
    }
  };
}

export async function requireTocUser(request: Request) {
  return requireTocRole(request, ["admin", "director", "manager"]);
}

export function hasNationalAccess(user: TocAuthenticatedUser) {
  return user.role === "admin" || user.regions.includes("National");
}

export async function requireTocNationalAccess(request: Request, options: { allowDirector?: boolean } = {}) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission;

  const user = permission.user;
  if (hasNationalAccess(user) || (options.allowDirector && user.role === "director")) {
    return permission;
  }

  return {
    error: NextResponse.json({ error: "National responsibility is required for this TOC action." }, { status: 403 })
  };
}
