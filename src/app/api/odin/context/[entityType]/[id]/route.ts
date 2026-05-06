import { NextResponse } from "next/server";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { getSupabaseAdminClient } from "@/lib/supabase";

const contextTables: Record<string, { table: string; select: string }> = {
  action: { table: "action_items", select: "*,region:regions(name)" },
  action_item: { table: "action_items", select: "*,region:regions(name)" },
  compliance: { table: "compliance_items", select: "*,region:regions(name)" },
  compliance_item: { table: "compliance_items", select: "*,region:regions(name)" },
  equipment: { table: "equipment_assets", select: "*,region:regions(name)" },
  equipment_asset: { table: "equipment_assets", select: "*,region:regions(name)" },
  stock_order: { table: "stock_orders", select: "*,region:regions(name),item:stock_order_items(item_name)" },
  todo: { table: "todo_items", select: "*" },
  todo_item: { table: "todo_items", select: "*" },
  national_request: { table: "national_requests", select: "*,region:regions(name)" },
  calendar_job: { table: "calendar_jobs", select: "*" },
  productivity_site: { table: "productivity_sites", select: "*,region:regions(name)" }
};

function sessionKey(entityType: string, id: string) {
  return `toc:${entityType}:${id}`.replace(/\s+/g, "-").toLowerCase();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ entityType: string; id: string }> }
) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const params = await context.params;
  const entityType = params.entityType.toLowerCase();
  const entityId = params.id;
  const source = contextTables[entityType];

  if (!source) {
    return NextResponse.json({ connected: false, error: `Unsupported Odin context entity type: ${entityType}` }, { status: 400 });
  }

  const key = sessionKey(entityType, entityId);
  const [{ data: record, error: recordError }, { data: memory, error: memoryError }, { data: interactions, error: interactionsError }] = await Promise.all([
    supabase.from(source.table).select(source.select).eq("id", entityId).maybeSingle(),
    supabase.from("odin_memory").select("*").eq("session_key", key).maybeSingle(),
    supabase.from("odin_interactions").select("id,prompt,structured_response,created_at").eq("session_key", key).order("created_at", { ascending: false }).limit(10)
  ]);

  if (recordError || memoryError || interactionsError) {
    return NextResponse.json({ connected: false, error: recordError?.message || memoryError?.message || interactionsError?.message }, { status: 500 });
  }

  return NextResponse.json({
    connected: true,
    entityType,
    entityId,
    sessionKey: key,
    record,
    odinMemory: memory || null,
    recentOdinInteractions: interactions || []
  });
}
