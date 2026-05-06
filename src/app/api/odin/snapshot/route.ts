import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";

const snapshotLimit = 60;

async function readRows(input: {
  table: string;
  select: string;
  orderBy?: string;
  openStatusColumn?: string;
  openStatuses?: string[];
  equals?: Record<string, string | number | boolean>;
  excludeClosedColumn?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { rows: [], error: "Supabase server key is not configured." };

  let query = supabase
    .from(input.table)
    .select(input.select)
    .order(input.orderBy || "created_at", { ascending: false })
    .limit(snapshotLimit);

  if (input.openStatusColumn && input.openStatuses?.length) query = query.in(input.openStatusColumn, input.openStatuses);
  Object.entries(input.equals || {}).forEach(([column, value]) => {
    query = query.eq(column, value);
  });
  if (input.excludeClosedColumn) query = query.neq(input.excludeClosedColumn, "closed");

  const { data, error } = await query;
  return {
    rows: data || [],
    error: error?.message || null
  };
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const [
    actionItems,
    nationalRequests,
    stockOrders,
    complianceItems,
    equipmentAssets,
    productivitySites,
    todoItems,
    odinItems
  ] = await Promise.all([
    readRows({
      table: "action_items",
      select: "id,title,detail,source_page,directive_type,priority,status,due_at,created_at,updated_at,region:regions(name)",
      excludeClosedColumn: "status"
    }),
    readRows({
      table: "national_requests",
      select: "id,request_type,title,detail,status,source_action_id,manager_response,evidence,source_page,directive_type,created_at,updated_at,region:regions(name)",
      openStatusColumn: "status",
      openStatuses: ["awaiting_review", "returned_to_manager", "pending"]
    }),
    readRows({
      table: "stock_orders",
      select: "id,quantity,urgency,note,status,national_update,tracking_number,created_at,updated_at,region:regions(name),item:stock_order_items(item_name)",
      openStatusColumn: "status",
      openStatuses: ["submitted", "awaiting_review", "cancel_requested", "update_requested"]
    }),
    readRows({
      table: "compliance_items",
      select: "id,title,detail,status,due_at,linked_action_id,created_at,updated_at,region:regions(name)",
      excludeClosedColumn: "status"
    }),
    readRows({
      table: "equipment_assets",
      select: "id,asset_name,asset_type,current_status,latest_odometer,latest_hours,next_service_due,service_note,latest_reading_at,linked_action_id,updated_at,region:regions(name)",
      orderBy: "updated_at",
      openStatusColumn: "current_status",
      openStatuses: ["watch", "service_due", "overdue"]
    }),
    readRows({
      table: "productivity_sites",
      select: "id,site_name,productivity_score,latest_note,linked_action_id,created_at,updated_at,region:regions(name)"
    }),
    readRows({
      table: "todo_items",
      select: "id,title,is_done,is_important,shared_with,owner_role,owner_scope,created_at,updated_at",
      equals: { is_done: false }
    }),
    readRows({
      table: "odin_items",
      select: "id,item_type,title,summary,region,severity,confidence,status,approval_required,created_at,updated_at",
      openStatusColumn: "status",
      openStatuses: ["pending"]
    })
  ]);

  const sections = {
    actionItems,
    nationalRequests,
    stockOrders,
    complianceItems,
    equipmentAssets,
    productivitySites,
    todoItems,
    odinItems
  };

  return NextResponse.json({
    connected: true,
    generatedAt: new Date().toISOString(),
    actor: permission.kind,
    mode: "read_only_snapshot",
    instructions: {
      actionWriteEndpoint: "/api/odin/actions",
      todoReminderEndpoint: "/api/odin/todos",
      recommendationWriteEndpoint: "/api/odin/items",
      allowedWriteActions: ["direct_action_create", "direct_action_update", "direct_action_close", "direct_action_delete", "direct_action_duplicate_cleanup", "direct_todo_reminder_create", "create_recommendation"],
      actionCreationApprovalRequired: false,
      note: "Use /api/odin/actions for manager action items. It supports action=create, update, close, complete, clear, done and delete by id/ids. It also supports action=delete_duplicates with exactTitle and keepPerRegion. Use /api/odin/todos for shared manager To Do reminders. /api/odin/items is for non-action recommendations and audit memory only.",
      prohibitedActions: ["send_message", "change_user", "change_password", "change_role", "admin_settings"]
    },
    sections
  });
}
