import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocRole } from "@/lib/toc-auth";

type AuditRow = {
  id: string;
  created_at: string;
  actor_profile_id?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_table?: string | null;
  entity_id?: string | null;
  scope?: string | null;
  details?: Record<string, unknown> | null;
};

function mapAuditRow(row: AuditRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorProfileId: row.actor_profile_id || row.actor_id || null,
    actorRole: row.actor_role || "system",
    action: row.action,
    entityType: row.entity_type || row.entity_table || "toc",
    entityId: row.entity_id || null,
    scope: row.scope || "National",
    details: row.details || {}
  };
}

export async function GET(request: Request) {
  const permission = await requireTocRole(request, ["admin"]);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ connected: false, entries: [], error: "Supabase server key is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("audit_log")
    .select("id,created_at,actor_profile_id,actor_id,actor_role,action,entity_type,entity_table,entity_id,scope,details")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json({ connected: false, entries: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    connected: true,
    entries: ((data as AuditRow[] | null) || []).map(mapAuditRow)
  });
}

