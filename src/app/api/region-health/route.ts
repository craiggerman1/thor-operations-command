import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

type RegionRow = {
  id: string;
  name: string;
};

type ActionRow = {
  assigned_region_id: string | null;
  priority: string;
  directive_type: string;
};

type ProductivityRow = {
  region_id: string | null;
  productivity_score: number | null;
};

type RegionHealthConfig = {
  actionWeight: number;
  productivityWeight: number;
  openActionPenalty: number;
  urgentActionPenalty: number;
  minimumActionScore: number;
  healthyTarget: number;
};

const settingsKey = "region_health_config";
const defaultConfig: RegionHealthConfig = {
  actionWeight: 58,
  productivityWeight: 42,
  openActionPenalty: 14,
  urgentActionPenalty: 8,
  minimumActionScore: 10,
  healthyTarget: 95
};

function clampNumber(value: unknown, fallback: number, min = 0, max = 100) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normaliseConfig(value: Partial<RegionHealthConfig> | null | undefined): RegionHealthConfig {
  const actionWeight = clampNumber(value?.actionWeight, defaultConfig.actionWeight);
  const productivityWeight = clampNumber(value?.productivityWeight, defaultConfig.productivityWeight);
  const totalWeight = actionWeight + productivityWeight || 100;

  return {
    actionWeight: Math.round((actionWeight / totalWeight) * 100),
    productivityWeight: Math.round((productivityWeight / totalWeight) * 100),
    openActionPenalty: clampNumber(value?.openActionPenalty, defaultConfig.openActionPenalty, 1, 50),
    urgentActionPenalty: clampNumber(value?.urgentActionPenalty, defaultConfig.urgentActionPenalty, 0, 50),
    minimumActionScore: clampNumber(value?.minimumActionScore, defaultConfig.minimumActionScore, 0, 100),
    healthyTarget: clampNumber(value?.healthyTarget, defaultConfig.healthyTarget, 50, 100)
  };
}

async function readConfig() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return defaultConfig;

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", settingsKey)
    .maybeSingle();

  if (error || !data?.value) return defaultConfig;
  return normaliseConfig(data.value as Partial<RegionHealthConfig>);
}

async function saveConfig(config: RegionHealthConfig) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: settingsKey, value: config, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) throw error;
}

function getActionHealthScore(openActionCount: number, urgentActionCount: number, config: RegionHealthConfig) {
  if (openActionCount <= 0) return 100;
  return Math.max(config.minimumActionScore, 100 - openActionCount * config.openActionPenalty - urgentActionCount * config.urgentActionPenalty);
}

function getHealthTone(score: number) {
  if (score < 25) return "red";
  if (score < 50) return "amber";
  if (score < 95) return "yellow";
  return "green";
}

function getHealthText(score: number) {
  if (score < 25) return "Critical action load";
  if (score < 50) return "Action load hurting region health";
  if (score < 95) return "Watch open actions";
  return "Healthy and competitive";
}

export async function GET() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ regions: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const config = await readConfig();
  const [{ data: regionsData, error: regionsError }, { data: actionsData, error: actionsError }, { data: productivityData, error: productivityError }] = await Promise.all([
    supabase.from("regions").select("id,name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("action_items").select("assigned_region_id,priority,directive_type").neq("status", "closed"),
    supabase.from("productivity_sites").select("region_id,productivity_score")
  ]);

  if (regionsError || actionsError || productivityError) {
    return NextResponse.json({ regions: [], connected: false, error: regionsError?.message || actionsError?.message || productivityError?.message }, { status: 500 });
  }

  const actionRows = (actionsData as ActionRow[] | null) || [];
  const productivityRows = (productivityData as ProductivityRow[] | null) || [];
  const regions = ((regionsData as RegionRow[] | null) || []).map((region) => {
    const regionActions = actionRows.filter((item) => item.assigned_region_id === region.id || item.assigned_region_id === null);
    const urgentActionCount = regionActions.filter((item) => item.priority === "urgent" || item.priority === "high" || item.directive_type === "National Ops Directive").length;
    const regionProductivityRows = productivityRows.filter((item) => item.region_id === region.id && typeof item.productivity_score === "number");
    const productivityScore = regionProductivityRows.length
      ? Math.round(regionProductivityRows.reduce((total, item) => total + Number(item.productivity_score || 0), 0) / regionProductivityRows.length)
      : 100;
    const actionHealthScore = getActionHealthScore(regionActions.length, urgentActionCount, config);
    const healthScore = Math.round(actionHealthScore * (config.actionWeight / 100) + productivityScore * (config.productivityWeight / 100));

    return {
      id: region.id,
      name: region.name,
      healthScore,
      tone: getHealthTone(healthScore),
      healthText: getHealthText(healthScore),
      openActions: regionActions.length,
      urgentActions: urgentActionCount,
      productivityScore,
      actionHealthScore
    };
  });

  return NextResponse.json({ regions, config, connected: true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "saveConfig";
  const config = action === "resetConfig" ? defaultConfig : normaliseConfig(payload.config || {});

  try {
    await saveConfig(config);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Region Health settings update failed." }, { status: 500 });
  }

  return GET();
}
