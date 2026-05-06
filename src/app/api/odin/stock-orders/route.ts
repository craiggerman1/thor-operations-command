import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { odinIdsFromPayload, odinOperation, odinRegionId } from "@/lib/odin-api-utils";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { getSupabaseAdminClient } from "@/lib/supabase";

function normaliseUrgency(value: unknown) {
  return String(value || "normal").toLowerCase() === "urgent" ? "urgent" : "normal";
}

function toStorageStatus(value: unknown) {
  const status = String(value || "submitted").toLowerCase();
  if (status.includes("deliver")) return "delivered";
  if (status.includes("return")) return "returned";
  if (status.includes("cancel")) return status.includes("request") ? "cancel_requested" : "cancelled";
  if (status.includes("approve")) return "approved";
  if (status.includes("order")) return "ordered";
  if (status.includes("dispatch")) return "dispatched";
  if (status.includes("await") || status.includes("update")) return "awaiting_review";
  return "submitted";
}

async function stockItemId(itemName: unknown) {
  const item = String(itemName || "").trim();
  if (!item) return null;

  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const { data, error } = await supabase
    .from("stock_order_items")
    .select("id")
    .eq("item_name", item)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

function stockUpdates(payload: Record<string, unknown>) {
  const source = (payload.updates && typeof payload.updates === "object" ? payload.updates : payload) as Record<string, unknown>;
  const updates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };

  if (typeof source.status === "string") updates.status = toStorageStatus(source.status);
  if (typeof source.update === "string") updates.national_update = source.update;
  if (typeof source.nationalUpdate === "string") updates.national_update = source.nationalUpdate;
  if (typeof source.trackingNumber === "string") updates.tracking_number = source.trackingNumber || "Pending";
  if (typeof source.urgency === "string") updates.urgency = normaliseUrgency(source.urgency);
  if (typeof source.quantity !== "undefined") updates.quantity = Math.max(Number(source.quantity) || 1, 1);
  if (typeof source.note === "string") updates.note = source.note;

  return { updates, source };
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));

  try {
    const action = odinOperation(payload.action, ["create", "update", "complete", "close", "clear", "done", "delete"]);
    const actor = permission.kind === "toc" ? permission.user : undefined;

    if (action === "create") {
      const regionId = await odinRegionId(payload.region || "National");
      const itemId = await stockItemId(payload.item || payload.itemName);
      if (!regionId) throw new Error("Stock order region could not be matched.");
      if (!itemId) throw new Error("Stock order item could not be matched to an active catalogue item.");

      const { data, error } = await supabase.from("stock_orders").insert({
        region_id: regionId,
        item_id: itemId,
        quantity: Math.max(Number(payload.quantity) || 1, 1),
        urgency: normaliseUrgency(payload.urgency),
        note: payload.note || "Odin-created stock order request.",
        status: "submitted",
        national_update: "Awaiting national admin review.",
        tracking_number: "Pending"
      }).select("id").single();

      if (error) throw error;

      await logTocAudit({ actor, action: "odin.stock_order.create", entityTable: "stock_orders", entityId: data.id, details: { item: payload.item || payload.itemName, region: payload.region, actorType: permission.kind } });
      return NextResponse.json({ connected: true, action: "create", createdStockOrderIds: [data.id], count: 1 });
    }

    const ids = odinIdsFromPayload(payload, ["stockOrderIds", "orderIds", "createdStockOrderIds"]);
    if (!ids.length) throw new Error("Stock order id or ids are required for non-create operations.");

    if (action === "delete") {
      const { data, error } = await supabase.from("stock_orders").delete().in("id", ids).select("id");
      if (error) throw error;
      const deletedStockOrderIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
      await logTocAudit({ actor, action: "odin.stock_order.delete", entityTable: "stock_orders", entityId: deletedStockOrderIds[0], details: { requestedIds: ids, deletedStockOrderIds, actorType: permission.kind } });
      return NextResponse.json({ connected: true, action: "delete", deletedStockOrderIds, count: deletedStockOrderIds.length });
    }

    const updateBundle = action === "update" ? stockUpdates(payload) : {
      updates: { status: "delivered", updated_at: new Date().toISOString() },
      source: {}
    };

    if (action === "update" && Object.keys(updateBundle.updates).length <= 1) throw new Error("No supported stock order updates were supplied.");
    if (typeof updateBundle.source.region === "string") updateBundle.updates.region_id = await odinRegionId(updateBundle.source.region);
    if (updateBundle.source.item || updateBundle.source.itemName) {
      const nextItemId = await stockItemId(updateBundle.source.item || updateBundle.source.itemName);
      if (!nextItemId) throw new Error("Updated stock order item could not be matched to an active catalogue item.");
      updateBundle.updates.item_id = nextItemId;
    }

    const { data, error } = await supabase.from("stock_orders").update(updateBundle.updates).in("id", ids).select("id");
    if (error) throw error;
    const affectedIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
    await logTocAudit({ actor, action: action === "update" ? "odin.stock_order.update" : "odin.stock_order.complete", entityTable: "stock_orders", entityId: affectedIds[0], details: { requestedIds: ids, affectedIds, updates: updateBundle.updates, actorType: permission.kind } });
    return NextResponse.json({ connected: true, action, updatedStockOrderIds: action === "update" ? affectedIds : undefined, completedStockOrderIds: action !== "update" ? affectedIds : undefined, count: affectedIds.length });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Odin stock order request could not be completed." }, { status: 400 });
  }
}
