import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { integrationDefaults, isIntegrationSlug, normaliseIntegrationConfig } from "@/lib/integration-settings";
import type { IntegrationPageSlug, IntegrationSourceConfig } from "@/lib/integration-settings";

function getSettingsKey(slug: IntegrationPageSlug) {
  return `integration_settings_${slug}`;
}

function getSlugFromRequest(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  return isIntegrationSlug(slug) ? slug : null;
}

async function readConfig(slug: IntegrationPageSlug) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return integrationDefaults[slug];

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", getSettingsKey(slug))
    .maybeSingle();

  if (error || !data?.value) return integrationDefaults[slug];
  return normaliseIntegrationConfig(slug, data.value as Partial<IntegrationSourceConfig>);
}

async function saveConfig(config: IntegrationSourceConfig) {
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

  if (!slug) return NextResponse.json({ error: "Supported integration slug is required." }, { status: 400 });
  if (!supabase) {
    return NextResponse.json({ config: integrationDefaults[slug], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  return NextResponse.json({ config: await readConfig(slug), connected: true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const slug = isIntegrationSlug(payload.slug || "") ? payload.slug as IntegrationPageSlug : null;
  if (!slug) return NextResponse.json({ error: "Supported integration slug is required." }, { status: 400 });

  const action = payload.action || "saveConfig";
  const config = action === "resetConfig" ? integrationDefaults[slug] : normaliseIntegrationConfig(slug, payload.config || {});

  try {
    await saveConfig(config);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Integration settings update failed." }, { status: 500 });
  }

  return NextResponse.json({ config: await readConfig(slug), connected: true });
}
