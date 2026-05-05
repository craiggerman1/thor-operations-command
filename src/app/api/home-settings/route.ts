import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { defaultHomeSettings, normaliseHomeSettings } from "@/lib/home-settings";
import type { HomeSettingsConfig } from "@/lib/home-settings";

const settingsKey = "home_settings_config";

async function readHomeSettings() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return defaultHomeSettings;

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", settingsKey)
    .maybeSingle();

  if (error || !data?.value) return defaultHomeSettings;
  return normaliseHomeSettings(data.value as Partial<HomeSettingsConfig>);
}

async function saveHomeSettings(config: HomeSettingsConfig) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: settingsKey, value: config, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) throw error;
}

export async function GET() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ config: defaultHomeSettings, connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  return NextResponse.json({ config: await readHomeSettings(), connected: true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "saveConfig";
  const config = action === "resetConfig" ? defaultHomeSettings : normaliseHomeSettings(payload.config || {});

  try {
    await saveHomeSettings(config);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Home settings update failed." }, { status: 500 });
  }

  return GET();
}
