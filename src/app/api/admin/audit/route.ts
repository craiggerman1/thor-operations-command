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

type ProfileRow = {
  id: string;
  display_name: string;
  email: string | null;
  access_level: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined) {
  return Boolean(value && uuidPattern.test(value));
}

function mapAuditRow(row: AuditRow, profiles: Map<string, ProfileRow>) {
  const actorProfileId = row.actor_profile_id || row.actor_id || null;
  const actorProfile = actorProfileId ? profiles.get(actorProfileId) : undefined;
  const targetProfile = row.entity_type === "profiles" && row.entity_id ? profiles.get(row.entity_id) : undefined;

  return {
    id: row.id,
    createdAt: row.created_at,
    actorProfileId,
    actorName: actorProfile?.display_name || null,
    actorEmail: actorProfile?.email || null,
    actorRole: row.actor_role || "system",
    action: row.action,
    entityType: row.entity_type || row.entity_table || "toc",
    entityId: row.entity_id || null,
    entityName: targetProfile?.display_name || null,
    entityEmail: targetProfile?.email || null,
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

  const auditRows = (data as AuditRow[] | null) || [];
  const profileIds = Array.from(new Set(auditRows.flatMap((row) => [
    row.actor_profile_id || row.actor_id,
    row.entity_type === "profiles" ? row.entity_id : null
  ]).filter(isUuid) as string[]));

  const profileMap = new Map<string, ProfileRow>();
  if (profileIds.length) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id,display_name,email,access_level")
      .in("id", profileIds);

    ((profileData as ProfileRow[] | null) || []).forEach((profile) => {
      profileMap.set(profile.id, profile);
    });
  }

  return NextResponse.json({
    connected: true,
    entries: auditRows.map((row) => mapAuditRow(row, profileMap))
  });
}
