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

function getActionHealthScore(openActionCount: number, urgentActionCount: number) {
  if (openActionCount <= 0) return 100;
  return Math.max(10, 100 - openActionCount * 14 - urgentActionCount * 8);
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
    const actionHealthScore = getActionHealthScore(regionActions.length, urgentActionCount);
    const healthScore = Math.round(actionHealthScore * 0.58 + productivityScore * 0.42);

    return {
      id: region.id,
      name: region.name,
      healthScore,
      tone: getHealthTone(healthScore),
      healthText: getHealthText(healthScore),
      openActions: regionActions.length,
      urgentActions: urgentActionCount,
      productivityScore
    };
  });

  return NextResponse.json({ regions, connected: true });
}
