import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

type StockOrderRow = {
  id: string;
  quantity: number;
  urgency: string;
  note: string | null;
  status: string;
  national_update: string | null;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
  region?: { name: string } | { name: string }[] | null;
  item?: { item_name: string } | { item_name: string }[] | null;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normaliseUrgency(urgency: string) {
  return urgency.toLowerCase() === "urgent" ? "urgent" : "normal";
}

function toDisplayUrgency(urgency: string) {
  return urgency.toLowerCase() === "urgent" ? "Urgent" : "Normal";
}

function toDisplayStatus(status: string) {
  const labels: Record<string, string> = {
    submitted: "Request submitted",
    awaiting_review: "Awaiting national approval",
    approved: "Approved by national",
    ordered: "Ordered",
    dispatched: "Dispatched",
    delivered: "Delivered",
    cancel_requested: "Cancellation requested",
    cancelled: "Cancelled"
  };

  return labels[status] || status;
}

function toStorageStatus(status: string) {
  const normalised = status.toLowerCase();
  if (normalised.includes("delivered")) return "delivered";
  if (normalised.includes("cancel")) return normalised.includes("request") ? "cancel_requested" : "cancelled";
  if (normalised.includes("approved")) return "approved";
  if (normalised.includes("ordered")) return "ordered";
  if (normalised.includes("dispatch")) return "dispatched";
  if (normalised.includes("await")) return "awaiting_review";
  return "submitted";
}

function mapStockOrder(row: StockOrderRow) {
  const region = firstRelated(row.region);
  const item = firstRelated(row.item);

  return {
    id: row.id,
    item: item?.item_name || "Unknown item",
    region: region?.name || "National",
    quantity: row.quantity,
    urgency: toDisplayUrgency(row.urgency),
    status: toDisplayStatus(row.status),
    note: row.note || "No additional note supplied.",
    update: row.national_update || "Awaiting national admin review.",
    trackingNumber: row.tracking_number || "Pending",
    updateRequested: row.status === "awaiting_review",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findRegionId(regionName: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("regions")
    .select("id")
    .eq("name", regionName)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

async function findItemId(itemName: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("stock_order_items")
    .select("id")
    .eq("item_name", itemName)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

export async function GET() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ orders: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("stock_orders")
    .select("id,quantity,urgency,note,status,national_update,tracking_number,created_at,updated_at,region:regions(name),item:stock_order_items(item_name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ orders: [], connected: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: ((data as StockOrderRow[] | null) || []).map(mapStockOrder), connected: true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "create") {
    const regionId = await findRegionId(payload.region || "National");
    const itemId = await findItemId(payload.item || "");

    if (!regionId || !itemId) {
      return NextResponse.json({ error: "Region or stock item could not be matched in Supabase." }, { status: 400 });
    }

    const { error } = await supabase.from("stock_orders").insert({
      region_id: regionId,
      item_id: itemId,
      quantity: Math.max(Number(payload.quantity) || 1, 1),
      urgency: normaliseUrgency(payload.urgency || "normal"),
      note: payload.note || "No additional note supplied.",
      status: "submitted",
      national_update: "Awaiting national admin review.",
      tracking_number: "Pending"
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET();
  }

  if (action === "update") {
    const id = payload.id;
    const updates = payload.updates || {};

    if (!id) return NextResponse.json({ error: "Stock order id is required." }, { status: 400 });

    const dbUpdates: Record<string, string | number | null> = {};
    if (typeof updates.status === "string") dbUpdates.status = toStorageStatus(updates.status);
    if (typeof updates.update === "string") dbUpdates.national_update = updates.update;
    if (typeof updates.trackingNumber === "string") dbUpdates.tracking_number = updates.trackingNumber || "Pending";
    if (typeof updates.urgency === "string") dbUpdates.urgency = normaliseUrgency(updates.urgency);
    if (typeof updates.quantity === "number") dbUpdates.quantity = Math.max(updates.quantity, 1);
    if (typeof updates.note === "string") dbUpdates.note = updates.note;
    dbUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase.from("stock_orders").update(dbUpdates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET();
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "Stock order id is required." }, { status: 400 });
    const { error } = await supabase.from("stock_orders").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET();
  }

  return NextResponse.json({ error: "Unsupported stock order action." }, { status: 400 });
}
