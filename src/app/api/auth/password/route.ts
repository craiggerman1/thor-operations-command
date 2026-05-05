import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!token) return NextResponse.json({ error: "Missing authenticated session token." }, { status: 401 });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || "Authenticated user could not be confirmed." }, { status: 401 });
  }

  const appMetadata = {
    ...(authData.user.app_metadata || {}),
    must_change_password: false
  };

  const { error } = await supabase.auth.admin.updateUserById(authData.user.id, {
    app_metadata: appMetadata
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
