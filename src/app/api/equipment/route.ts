import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { Status } from "@/lib/toc-data";

type EquipmentAssetRow = {
  id: string;
  asset_name: string;
  asset_type: string | null;
  region_id?: string | null;
  current_status: string | null;
  latest_odometer: number | null;
  latest_hours: number | null;
  next_service_due: string | null;
  service_note: string | null;
  latest_reading_at: string | null;
  linked_action_id: string | null;
  updated_at: string;
  region?: { name: string } | { name: string }[] | null;
};

type RegionRow = {
  id: string;
  name: string;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getStatusTone(status: string): Status {
  const normalised = status.toLowerCase();
  if (normalised.includes("overdue") || normalised.includes("repair") || normalised.includes("stop")) return "red";
  if (normalised.includes("due") || normalised.includes("watch") || normalised.includes("book")) return "amber";
  if (normalised.includes("ready") || normalised.includes("active") || normalised.includes("serviceable")) return "green";
  return "blue";
}

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(Number(value))) return "--";
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(Number(value));
}

function toNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getRegionId(regionName: string) {
  if (!regionName || regionName === "National") return null;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("regions")
    .select("id,name")
    .eq("name", regionName)
    .maybeSingle();

  if (error) throw error;
  return (data as RegionRow | null)?.id || null;
}

function isRiskStatus(status: string) {
  const tone = getStatusTone(status);
  return tone === "red" || tone === "amber";
}

async function syncLinkedAction(asset: EquipmentAssetRow) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const status = asset.current_status || "Service review";
  const shouldHaveAction = isRiskStatus(status);
  const title = `Equipment servicing: ${asset.asset_name}`;
  const detail = asset.service_note || `${asset.asset_name} requires servicing review.`;

  if (shouldHaveAction && asset.linked_action_id) {
    const { error } = await supabase
      .from("action_items")
      .update({
        title,
        detail,
        source_page: "equipment-servicing",
        directive_type: status.toLowerCase().includes("overdue") || status.toLowerCase().includes("repair") ? "National Ops Directive" : "Scheduled Directive",
        priority: status.toLowerCase().includes("overdue") || status.toLowerCase().includes("repair") ? "high" : "normal",
        status: "open",
        assigned_region_id: asset.region_id || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", asset.linked_action_id);
    if (error) throw error;
    return asset.linked_action_id;
  }

  if (shouldHaveAction) {
    const { data, error } = await supabase
      .from("action_items")
      .insert({
        title,
        detail,
        source_page: "equipment-servicing",
        directive_type: status.toLowerCase().includes("overdue") || status.toLowerCase().includes("repair") ? "National Ops Directive" : "Scheduled Directive",
        priority: status.toLowerCase().includes("overdue") || status.toLowerCase().includes("repair") ? "high" : "normal",
        status: "open",
        assigned_region_id: asset.region_id || null,
        due_at: null
      })
      .select("id")
      .single();

    if (error) throw error;
    const { error: linkError } = await supabase
      .from("equipment_assets")
      .update({ linked_action_id: data.id, updated_at: new Date().toISOString() })
      .eq("id", asset.id);
    if (linkError) throw linkError;
    return data.id as string;
  }

  if (!shouldHaveAction && asset.linked_action_id) {
    const { error: actionError } = await supabase.from("action_items").delete().eq("id", asset.linked_action_id);
    if (actionError) throw actionError;
    const { error: unlinkError } = await supabase
      .from("equipment_assets")
      .update({ linked_action_id: null, updated_at: new Date().toISOString() })
      .eq("id", asset.id);
    if (unlinkError) throw unlinkError;
  }

  return null;
}

function mapAsset(row: EquipmentAssetRow) {
  const region = firstRelated(row.region);
  const status = row.current_status || "No status loaded";

  return {
    id: row.id,
    asset: row.asset_name,
    category: row.asset_type || "Asset",
    region: region?.name || "National",
    status,
    severity: getStatusTone(status),
    latestOdometer: formatNumber(row.latest_odometer),
    latestHours: formatNumber(row.latest_hours),
    nextService: row.next_service_due || "Not set",
    serviceNote: row.service_note || "No servicing note loaded.",
    latestReadingAt: row.latest_reading_at || row.updated_at,
    actionHref: row.linked_action_id ? `/actions/${row.linked_action_id}` : ""
  };
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ assets: [], summary: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "National";

  const { data, error } = await supabase
    .from("equipment_assets")
    .select("id,asset_name,asset_type,current_status,latest_odometer,latest_hours,next_service_due,service_note,latest_reading_at,linked_action_id,updated_at,region:regions(name)")
    .order("asset_name", { ascending: true });

  if (error) {
    return NextResponse.json({ assets: [], summary: [], connected: false, error: error.message }, { status: 500 });
  }

  const assets = ((data as EquipmentAssetRow[] | null) || [])
    .map(mapAsset)
    .filter((asset) => scope === "National" || asset.region === scope);
  const serviceDue = assets.filter((asset) => asset.severity === "amber" || asset.severity === "red").length;
  const redAssets = assets.filter((asset) => asset.severity === "red").length;
  const greenAssets = assets.filter((asset) => asset.severity === "green").length;

  return NextResponse.json({
    assets,
    summary: [
      { label: "Assets loaded", value: assets.length.toString(), detail: "Assets under selected scope", severity: assets.length ? "blue" : "amber" },
      { label: "Service due", value: serviceDue.toString(), detail: "Assets needing review", severity: serviceDue ? "amber" : "green" },
      { label: "Serviceable", value: greenAssets.toString(), detail: "Assets currently green", severity: "green" },
      { label: "Critical", value: redAssets.toString(), detail: "Assets needing immediate action", severity: redAssets ? "red" : "green" }
    ],
    connected: true
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ assets: [], summary: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "create") {
    const assetName = String(payload.assetName || "").trim();
    if (!assetName) return NextResponse.json({ error: "Asset name is required." }, { status: 400 });

    const { data, error } = await supabase
      .from("equipment_assets")
      .insert({
        asset_name: assetName,
        asset_type: payload.assetType || "Wash asset",
        region_id: await getRegionId(payload.region || "National"),
        current_status: payload.status || "Serviceable",
        latest_odometer: toNumber(payload.latestOdometer),
        latest_hours: toNumber(payload.latestHours),
        next_service_due: payload.nextService || "Not set",
        service_note: payload.serviceNote || "No servicing note loaded.",
        latest_reading_at: new Date().toISOString()
      })
      .select("id,asset_name,asset_type,current_status,latest_odometer,latest_hours,next_service_due,service_note,latest_reading_at,linked_action_id,updated_at,region_id,region:regions(name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await syncLinkedAction(data as EquipmentAssetRow);
    return GET(request);
  }

  if (action === "update") {
    if (!payload.id) return NextResponse.json({ error: "Asset id is required." }, { status: 400 });
    const updates = payload.updates || {};
    const dbUpdates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };

    if (typeof updates.assetName === "string") dbUpdates.asset_name = updates.assetName.trim();
    if (typeof updates.assetType === "string") dbUpdates.asset_type = updates.assetType;
    if (typeof updates.status === "string") dbUpdates.current_status = updates.status;
    if (typeof updates.latestOdometer !== "undefined") dbUpdates.latest_odometer = toNumber(updates.latestOdometer);
    if (typeof updates.latestHours !== "undefined") dbUpdates.latest_hours = toNumber(updates.latestHours);
    if (typeof updates.nextService === "string") dbUpdates.next_service_due = updates.nextService || "Not set";
    if (typeof updates.serviceNote === "string") dbUpdates.service_note = updates.serviceNote;
    if (typeof updates.region === "string") dbUpdates.region_id = await getRegionId(updates.region);
    if (typeof updates.latestOdometer !== "undefined" || typeof updates.latestHours !== "undefined") dbUpdates.latest_reading_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("equipment_assets")
      .update(dbUpdates)
      .eq("id", payload.id)
      .select("id,asset_name,asset_type,current_status,latest_odometer,latest_hours,next_service_due,service_note,latest_reading_at,linked_action_id,updated_at,region_id,region:regions(name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await syncLinkedAction(data as EquipmentAssetRow);
    return GET(request);
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "Asset id is required." }, { status: 400 });

    const { data: asset, error: readError } = await supabase
      .from("equipment_assets")
      .select("linked_action_id")
      .eq("id", payload.id)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const { error } = await supabase.from("equipment_assets").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (asset?.linked_action_id) {
      const { error: actionError } = await supabase.from("action_items").delete().eq("id", asset.linked_action_id);
      if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    return GET(request);
  }

  return NextResponse.json({ error: "Unsupported equipment operation." }, { status: 400 });
}
