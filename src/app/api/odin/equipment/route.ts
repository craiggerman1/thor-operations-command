import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { odinDueToIso, odinIdsFromPayload, odinNumber, odinOperation, odinRegionId } from "@/lib/odin-api-utils";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { buildOdinOperationalContext, saveOdinOperationalMemory } from "@/lib/odin-operational-context";
import { getSupabaseAdminClient } from "@/lib/supabase";

type EquipmentAssetRow = {
  id: string;
  asset_name: string;
  asset_type: string | null;
  region_id: string | null;
  current_status: string | null;
  service_note: string | null;
  linked_action_id: string | null;
};

function isRiskStatus(status: string) {
  const normalised = status.toLowerCase();
  return normalised.includes("overdue") || normalised.includes("repair") || normalised.includes("stop") || normalised.includes("due") || normalised.includes("watch") || normalised.includes("book");
}

async function syncLinkedAction(asset: EquipmentAssetRow) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const status = asset.current_status || "Service review";
  const shouldHaveAction = isRiskStatus(status);
  const title = `Equipment servicing: ${asset.asset_name}`;
  const detail = asset.service_note || `${asset.asset_name} requires servicing review.`;
  const urgent = status.toLowerCase().includes("overdue") || status.toLowerCase().includes("repair") || status.toLowerCase().includes("stop");

  if (shouldHaveAction && asset.linked_action_id) {
    await supabase.from("action_items").update({
      title,
      detail,
      source_page: "equipment-servicing",
      directive_type: urgent ? "National Ops Directive" : "Scheduled Directive",
      priority: urgent ? "high" : "normal",
      status: "open",
      assigned_region_id: asset.region_id || null,
      updated_at: new Date().toISOString()
    }).eq("id", asset.linked_action_id).throwOnError();
    return asset.linked_action_id;
  }

  if (shouldHaveAction) {
    const { data, error } = await supabase.from("action_items").insert({
      title,
      detail,
      source_page: "equipment-servicing",
      directive_type: urgent ? "National Ops Directive" : "Scheduled Directive",
      priority: urgent ? "high" : "normal",
      status: "open",
      assigned_region_id: asset.region_id || null,
      due_at: null
    }).select("id").single();

    if (error) throw error;
    await supabase.from("equipment_assets").update({ linked_action_id: data.id, updated_at: new Date().toISOString() }).eq("id", asset.id).throwOnError();
    return data.id as string;
  }

  if (!shouldHaveAction && asset.linked_action_id) {
    await supabase.from("action_items").delete().eq("id", asset.linked_action_id).throwOnError();
    await supabase.from("equipment_assets").update({ linked_action_id: null, updated_at: new Date().toISOString() }).eq("id", asset.id).throwOnError();
  }

  return null;
}

function equipmentUpdates(payload: Record<string, unknown>) {
  const source = (payload.updates && typeof payload.updates === "object" ? payload.updates : payload) as Record<string, unknown>;
  const updates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };

  if (typeof source.assetName === "string") updates.asset_name = source.assetName.trim();
  if (typeof source.name === "string") updates.asset_name = source.name.trim();
  if (typeof source.assetType === "string") updates.asset_type = source.assetType;
  if (typeof source.status === "string") updates.current_status = source.status;
  if (typeof source.latestOdometer !== "undefined") updates.latest_odometer = odinNumber(source.latestOdometer);
  if (typeof source.latestHours !== "undefined") updates.latest_hours = odinNumber(source.latestHours);
  if (typeof source.nextService === "string") updates.next_service_due = source.nextService || "Not set";
  if (typeof source.serviceNote === "string") updates.service_note = source.serviceNote;
  if (typeof source.note === "string") updates.service_note = source.note;
  if (typeof source.latestOdometer !== "undefined" || typeof source.latestHours !== "undefined") updates.latest_reading_at = new Date().toISOString();
  const dueAt = odinDueToIso(source.nextServiceDue || source.serviceDueAt);
  if (dueAt !== undefined) updates.next_service_due = dueAt || "Not set";

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
      const assetName = String(payload.assetName || payload.name || "").trim();
      if (!assetName) throw new Error("Asset name is required.");

      const { data, error } = await supabase.from("equipment_assets").insert({
        asset_name: assetName,
        asset_type: payload.assetType || "Wash asset",
        region_id: await odinRegionId(payload.region || "National"),
        current_status: payload.status || "Serviceable",
        latest_odometer: odinNumber(payload.latestOdometer),
        latest_hours: odinNumber(payload.latestHours),
        next_service_due: payload.nextService || "Not set",
        service_note: payload.serviceNote || payload.note || "No servicing note loaded.",
        latest_reading_at: new Date().toISOString()
      }).select("id,asset_name,asset_type,region_id,current_status,service_note,linked_action_id").single();

      if (error) throw error;
      const actionId = await syncLinkedAction(data as EquipmentAssetRow);
      const regionName = String(payload.region || "National");
      const operationalContext = buildOdinOperationalContext({
        payload: { ...payload, assetName },
        destination: "equipment",
        region: regionName,
        title: assetName,
        sourcePage: "Equipment Servicing",
        severity: String(payload.severity || (isRiskStatus(String(payload.status || "")) ? "amber" : "blue")),
        priority: String(payload.priority || "normal"),
        dueAt: null
      });
      await logTocAudit({ actor, action: "odin.equipment.create", entityTable: "equipment_assets", entityId: data.id, details: { assetName, linkedActionId: actionId, ownership: operationalContext, actorType: permission.kind } });
      await saveOdinOperationalMemory({
        context: operationalContext,
        sourceType: "equipment_asset",
        sourceId: data.id,
        region: regionName,
        title: assetName,
        summary: String(payload.serviceNote || payload.note || "Odin-created equipment servicing record."),
        lastResponse: { linkedActionId: actionId, createdBy: "odin" }
      });
      return NextResponse.json({ connected: true, action: "create", createdAssetIds: [data.id], linkedActionIds: actionId ? [actionId] : [], count: 1 });
    }

    const ids = odinIdsFromPayload(payload, ["assetIds", "equipmentIds", "createdAssetIds"]);
    if (!ids.length) throw new Error("Equipment asset id or ids are required for non-create operations.");

    const { data: existingAssets, error: existingError } = await supabase
      .from("equipment_assets")
      .select("id,asset_name,asset_type,region_id,current_status,service_note,linked_action_id")
      .in("id", ids);

    if (existingError) throw existingError;
    const existingRows = (existingAssets as EquipmentAssetRow[] | null) || [];
    const linkedActionIds = existingRows.map((asset) => asset.linked_action_id).filter(Boolean) as string[];

    if (action === "delete") {
      const { data, error } = await supabase.from("equipment_assets").delete().in("id", ids).select("id");
      if (error) throw error;
      if (linkedActionIds.length) await supabase.from("action_items").delete().in("id", linkedActionIds).throwOnError();
      const deletedIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
      await logTocAudit({ actor, action: "odin.equipment.delete", entityTable: "equipment_assets", entityId: deletedIds[0], details: { requestedIds: ids, deletedIds, linkedActionIds, actorType: permission.kind } });
      return NextResponse.json({ connected: true, action: "delete", deletedAssetIds: deletedIds, deletedActionIds: linkedActionIds, count: deletedIds.length });
    }

    const updateBundle = action === "update" ? equipmentUpdates(payload) : {
      updates: { current_status: "Serviceable", updated_at: new Date().toISOString() },
      source: {}
    };

    if (action === "update" && Object.keys(updateBundle.updates).length <= 1) throw new Error("No supported equipment updates were supplied.");
    if (typeof updateBundle.source.region === "string") updateBundle.updates.region_id = await odinRegionId(updateBundle.source.region);

    const { data, error } = await supabase.from("equipment_assets")
      .update(updateBundle.updates)
      .in("id", ids)
      .select("id,asset_name,asset_type,region_id,current_status,service_note,linked_action_id");

    if (error) throw error;
    const affectedRows = (data as EquipmentAssetRow[] | null) || [];
    const syncedActionIds = (await Promise.all(affectedRows.map(syncLinkedAction))).filter(Boolean) as string[];
    await logTocAudit({ actor, action: action === "update" ? "odin.equipment.update" : "odin.equipment.complete", entityTable: "equipment_assets", entityId: affectedRows[0]?.id, details: { requestedIds: ids, affectedAssetIds: affectedRows.map((asset) => asset.id), syncedActionIds, updates: updateBundle.updates, actorType: permission.kind } });
    return NextResponse.json({ connected: true, action, updatedAssetIds: action === "update" ? affectedRows.map((asset) => asset.id) : undefined, completedAssetIds: action !== "update" ? affectedRows.map((asset) => asset.id) : undefined, linkedActionIds: syncedActionIds, count: affectedRows.length });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Odin equipment request could not be completed." }, { status: 400 });
  }
}
