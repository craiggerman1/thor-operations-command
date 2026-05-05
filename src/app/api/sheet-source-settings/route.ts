import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { isSheetSourceSlug, normaliseSheetSourceConfig, sheetSourceDefaults } from "@/lib/sheet-source-settings";
import type { SheetSourceConfig, SheetSourceSlug } from "@/lib/sheet-source-settings";

function getSettingsKey(slug: SheetSourceSlug) {
  return `sheet_source_settings_${slug}`;
}

function getSlugFromRequest(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  return isSheetSourceSlug(slug) ? slug : null;
}

async function readConfig(slug: SheetSourceSlug) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return sheetSourceDefaults[slug];

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", getSettingsKey(slug))
    .maybeSingle();

  if (error || !data?.value) return sheetSourceDefaults[slug];
  return normaliseSheetSourceConfig(slug, data.value as Partial<SheetSourceConfig>);
}

async function saveConfig(config: SheetSourceConfig) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: getSettingsKey(config.slug), value: config, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) throw error;
}

export async function GET(request: Request) {
  const slug = getSlugFromRequest(request);
  const supabase = getSupabaseAdminClient();

  if (!slug) return NextResponse.json({ error: "Supported sheet source slug is required." }, { status: 400 });
  if (!supabase) {
    return NextResponse.json({ config: sheetSourceDefaults[slug], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  return NextResponse.json({ config: await readConfig(slug), connected: true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const slug = isSheetSourceSlug(payload.slug || "") ? payload.slug as SheetSourceSlug : null;
  if (!slug) return NextResponse.json({ error: "Supported sheet source slug is required." }, { status: 400 });

  const action = payload.action || "saveConfig";
  const config = action === "resetConfig" ? sheetSourceDefaults[slug] : normaliseSheetSourceConfig(slug, payload.config || {});

  try {
    await saveConfig(config);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sheet source settings update failed." }, { status: 500 });
  }

  return NextResponse.json({ config: await readConfig(slug), connected: true });
}
