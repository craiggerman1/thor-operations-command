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

type StockOrderItemRow = {
  id: string;
  item_name: string;
  is_active: boolean;
  created_at: string;
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
  if (normalised.includes("request submitted")) return "submitted";
  if (normalised.includes("delivered")) return "delivered";
  if (normalised.includes("cancel")) return normalised.includes("request") ? "cancel_requested" : "cancelled";
  if (normalised.includes("approved")) return "approved";
  if (normalised.includes("ordered")) return "ordered";
  if (normalised.includes("dispatch")) return "dispatched";
  if (normalised.includes("await") || normalised.includes("update")) return "awaiting_review";
  return "submitted";
}

function isOpenOrderStatus(status: string) {
  return ["submitted", "awaiting_review", "approved", "ordered", "dispatched", "cancel_requested"].includes(status);
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
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

function scopedRequest(request: Request, payload: Record<string, unknown>) {
  const url = new URL(request.url);
  if (payload.all === true) {
    url.searchParams.set("all", "true");
  } else if (typeof payload.scope === "string" && payload.scope) {
    url.searchParams.set("scope", payload.scope);
  }
  if (payload.active === true) {
    url.searchParams.set("active", "true");
  }

  return new Request(url, { method: "GET", headers: request.headers });
}

function mapCatalogItem(row: StockOrderItemRow) {
  return {
    id: row.id,
    item: row.item_name,
    status: row.is_active ? "Active" : "Inactive",
    createdAt: row.created_at
  };
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ orders: [], catalog: [], stockItems: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "National";
  const showAll = url.searchParams.get("all") === "true" || scope === "National";
  const activeOnly = url.searchParams.get("active") === "true";

  const [{ data, error }, { data: catalogData, error: catalogError }] = await Promise.all([
    supabase
      .from("stock_orders")
      .select("id,quantity,urgency,note,status,national_update,tracking_number,created_at,updated_at,region:regions(name),item:stock_order_items(item_name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("stock_order_items")
      .select("id,item_name,is_active,created_at")
      .order("item_name", { ascending: true })
  ]);

  if (error || catalogError) {
    return NextResponse.json({ orders: [], catalog: [], stockItems: [], connected: false, error: error?.message || catalogError?.message }, { status: 500 });
  }

  const catalog = ((catalogData as StockOrderItemRow[] | null) || []).map(mapCatalogItem);
  const orders = ((data as StockOrderRow[] | null) || [])
    .filter((order) => {
      const region = firstRelated(order.region);
      const matchesScope = showAll || region?.name === scope;
      const matchesActive = !activeOnly || isOpenOrderStatus(order.status);
      return matchesScope && matchesActive;
    })
    .map(mapStockOrder);

  return NextResponse.json({
    orders,
    catalog,
    stockItems: catalog.filter((item) => item.status === "Active").map((item) => item.item),
    connected: true
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "createItem") {
    const itemName = String(payload.item || "").trim();
    if (!itemName) return NextResponse.json({ error: "Stock catalogue item name is required." }, { status: 400 });

    const { error } = await supabase.from("stock_order_items").insert({
      item_name: itemName,
      is_active: payload.isActive !== false
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(scopedRequest(request, payload));
  }

  if (action === "updateItem") {
    if (!payload.id) return NextResponse.json({ error: "Stock catalogue item id is required." }, { status: 400 });
    const updates: Record<string, string | boolean> = {};

    if (typeof payload.item === "string") updates.item_name = payload.item.trim();
    if (typeof payload.isActive === "boolean") updates.is_active = payload.isActive;

    const { error } = await supabase.from("stock_order_items").update(updates).eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(scopedRequest(request, payload));
  }

  if (action === "deleteItem") {
    if (!payload.id) return NextResponse.json({ error: "Stock catalogue item id is required." }, { status: 400 });
    const { error } = await supabase.from("stock_order_items").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(scopedRequest(request, payload));
  }

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
    return GET(scopedRequest(request, payload));
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
    return GET(scopedRequest(request, payload));
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "Stock order id is required." }, { status: 400 });
    const { error } = await supabase.from("stock_orders").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(scopedRequest(request, payload));
  }

  return NextResponse.json({ error: "Unsupported stock order action." }, { status: 400 });
}
