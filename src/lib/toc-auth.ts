import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { AccessRole } from "@/lib/access";

type AuthProfileRow = {
  access_level: AccessRole | "national";
  is_active: boolean;
};

export type TocAuthenticatedUser = {
  id: string;
  role: AccessRole;
};

function mapRole(role: string): AccessRole {
  if (role === "director") return "director";
  if (role === "admin") return "admin";
  return "manager";
}

function isDevelopmentAdminRequest(request: Request) {
  return process.env.TOC_ALLOW_DEVELOPMENT_ADMIN === "true" && request.headers.get("x-toc-development-session") === "true";
}

export async function requireTocRole(request: Request, roles: AccessRole[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 })
    };
  }

  if (isDevelopmentAdminRequest(request) && roles.includes("admin")) {
    return {
      user: {
        id: "development-admin",
        role: "admin" as AccessRole
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
    .select("access_level,is_active")
    .eq("id", authData.user.id)
    .single();

  if (error || !data) {
    return {
      error: NextResponse.json({ error: error?.message || "TOC user profile was not found." }, { status: 403 })
    };
  }

  const profile = data as AuthProfileRow;
  const role = mapRole(profile.access_level);
  if (!profile.is_active || !roles.includes(role)) {
    return {
      error: NextResponse.json({ error: "You do not have permission to perform this TOC action." }, { status: 403 })
    };
  }

  return {
    user: {
      id: authData.user.id,
      role
    }
  };
}
