import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { Status } from "@/lib/toc-data";

type EquipmentAssetRow = {
  id: string;
  asset_name: string;
  asset_type: string | null;
  current_status: string | null;
  latest_odometer: number | null;
  latest_hours: number | null;
  next_service_due: string | null;
  service_note: string | null;
  latest_reading_at: string | null;
  updated_at: string;
  region?: { name: string } | { name: string }[] | null;
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
    latestReadingAt: row.latest_reading_at || row.updated_at
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
    .select("id,asset_name,asset_type,current_status,latest_odometer,latest_hours,next_service_due,service_note,latest_reading_at,updated_at,region:regions(name)")
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
