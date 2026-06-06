import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocNationalAccess, requireTocUser } from "@/lib/toc-auth";

type RegionRow = {
  id: string;
  name: string;
};

type ActionRow = {
  assigned_region_id: string | null;
  priority: string;
  directive_type: string;
  status: string;
  due_at: string | null;
};

type ProductivityRow = {
  region_id: string | null;
  productivity_score: number | null;
};

type RegionHealthConfig = {
  actionWeight: number;
  productivityWeight: number;
  openActionPenalty: number;
  scheduledActionPenalty: number;
  urgentActionPenalty: number;
  overdueActionPenalty: number;
  minimumActionScore: number;
  healthyTarget: number;
  nationalDirectActionWeight: number;
};

const settingsKey = "region_health_config";
const defaultConfig: RegionHealthConfig = {
  actionWeight: 58,
  productivityWeight: 42,
  openActionPenalty: 14,
  scheduledActionPenalty: 5,
  urgentActionPenalty: 8,
  overdueActionPenalty: 12,
  minimumActionScore: 10,
  healthyTarget: 95,
  nationalDirectActionWeight: 20
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
    scheduledActionPenalty: clampNumber(value?.scheduledActionPenalty, defaultConfig.scheduledActionPenalty, 0, 50),
    urgentActionPenalty: clampNumber(value?.urgentActionPenalty, defaultConfig.urgentActionPenalty, 0, 50),
    overdueActionPenalty: clampNumber(value?.overdueActionPenalty, defaultConfig.overdueActionPenalty, 0, 50),
    minimumActionScore: clampNumber(value?.minimumActionScore, defaultConfig.minimumActionScore, 0, 100),
    healthyTarget: clampNumber(value?.healthyTarget, defaultConfig.healthyTarget, 50, 100),
    nationalDirectActionWeight: clampNumber(value?.nationalDirectActionWeight, defaultConfig.nationalDirectActionWeight, 0, 100)
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

function isOverdue(value: string | null | undefined, now = new Date()) {
  if (!value) return false;
  const dueDate = new Date(value);
  return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < now.getTime();
}

function actionPenalty(row: ActionRow, config: RegionHealthConfig, now = new Date()) {
  const basePenalty = row.directive_type === "Scheduled Directive" ? config.scheduledActionPenalty : config.openActionPenalty;
  const priorityPenalty = row.priority === "urgent" || row.priority === "high" || row.directive_type === "National Ops Directive"
    ? config.urgentActionPenalty
    : 0;
  const overduePenalty = isOverdue(row.due_at, now) ? config.overdueActionPenalty : 0;

  return basePenalty + priorityPenalty + overduePenalty;
}

function getActionHealthScore(actions: ActionRow[], config: RegionHealthConfig) {
  if (actions.length <= 0) return 100;
  const penalty = actions.reduce((total, row) => total + actionPenalty(row, config), 0);
  return Math.max(config.minimumActionScore, 100 - penalty);
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

function isOpenHealthStatus(status: string | null | undefined) {
  return status !== "closed";
}

function averageProductivity(rows: ProductivityRow[]) {
  const validRows = rows.filter((item) => typeof item.productivity_score === "number");
  if (!validRows.length) return 100;

  return Math.round(validRows.reduce((total, item) => total + Number(item.productivity_score || 0), 0) / validRows.length);
}

function averageScore(scores: number[]) {
  const validScores = scores.filter((score) => Number.isFinite(score));
  if (!validScores.length) return 100;
  return Math.round(validScores.reduce((total, score) => total + score, 0) / validScores.length);
}

export async function GET(request: Request) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ regions: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const config = await readConfig();
  const [{ data: regionsData, error: regionsError }, { data: actionsData, error: actionsError }, { data: productivityData, error: productivityError }] = await Promise.all([
    supabase.from("regions").select("id,name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("action_items").select("assigned_region_id,priority,directive_type,status,due_at"),
    supabase.from("productivity_sites").select("region_id,productivity_score")
  ]);

  if (regionsError || actionsError || productivityError) {
    return NextResponse.json({ regions: [], connected: false, error: regionsError?.message || actionsError?.message || productivityError?.message }, { status: 500 });
  }

  const actionRows = ((actionsData as ActionRow[] | null) || []).filter((item) => isOpenHealthStatus(item.status));
  const productivityRows = (productivityData as ProductivityRow[] | null) || [];
  const sourceRegions = (regionsData as RegionRow[] | null) || [];
  const regionalScores = sourceRegions
    .filter((region) => region.name !== "National")
    .map((region) => {
      const regionActions = actionRows.filter((item) => item.assigned_region_id === region.id);
      const urgentActionCount = regionActions.filter((item) => item.priority === "urgent" || item.priority === "high" || item.directive_type === "National Ops Directive").length;
      const regionProductivityRows = productivityRows.filter((item) => item.region_id === region.id);
      const productivityScore = averageProductivity(regionProductivityRows);
      const actionHealthScore = getActionHealthScore(regionActions, config);
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

  const nationalRegion = sourceRegions.find((region) => region.name === "National");
  const nationalDirectActions = actionRows.filter((item) => item.assigned_region_id === null);
  const nationalDirectProductivityRows = productivityRows.filter((item) => item.region_id === null);
  const nationalDirectActionScore = getActionHealthScore(nationalDirectActions, config);
  const nationalDirectProductivityScore = averageProductivity(nationalDirectProductivityRows);
  const nationalDirectHealthScore = Math.round(nationalDirectActionScore * (config.actionWeight / 100) + nationalDirectProductivityScore * (config.productivityWeight / 100));
  const regionalAverageHealthScore = averageScore(regionalScores.map((region) => region.healthScore));
  const directWeight = nationalDirectActions.length ? config.nationalDirectActionWeight / 100 : 0;
  const nationalHealthScore = Math.round(regionalAverageHealthScore * (1 - directWeight) + nationalDirectHealthScore * directWeight);
  const regions = nationalRegion ? [{
    id: nationalRegion.id,
    name: nationalRegion.name,
    healthScore: nationalHealthScore,
    tone: getHealthTone(nationalHealthScore),
    healthText: nationalDirectActions.length ? "Whole business average with direct National actions" : "Whole business regional average",
    openActions: regionalScores.reduce((total, region) => total + region.openActions, 0) + nationalDirectActions.length,
    urgentActions: regionalScores.reduce((total, region) => total + region.urgentActions, 0) + nationalDirectActions.filter((item) => item.priority === "urgent" || item.priority === "high" || item.directive_type === "National Ops Directive").length,
    productivityScore: averageScore(regionalScores.map((region) => region.productivityScore)),
    actionHealthScore: averageScore(regionalScores.map((region) => region.actionHealthScore))
  }, ...regionalScores] : regionalScores;

  return NextResponse.json({ regions, config, connected: true });
}

export async function POST(request: Request) {
  const permission = await requireTocNationalAccess(request);
  if (permission.error) return permission.error;

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

  return GET(request);
}
