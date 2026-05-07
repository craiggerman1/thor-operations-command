import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { canAccessScope, hasNationalAccess, resolvePermittedScope } from "@/lib/toc-auth";

const activeActionStatuses = ["open", "acknowledged", "in_progress", "blocked", "submitted_for_review", "returned_to_manager", "reopened", "escalated"];

async function tableCount(table: string, filters: Record<string, unknown> = {}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return 0;

  let query = supabase.from(table).select("id", { count: "exact", head: true });
  Object.entries(filters).forEach(([key, value]) => {
    query = Array.isArray(value) ? query.in(key, value) : query.eq(key, value);
  });
  const { count } = await query;
  return count || 0;
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const requestedScope = url.searchParams.get("scope") || "National";
  const scope = permission.kind === "toc" && permission.user
    ? resolvePermittedScope(permission.user, requestedScope)
    : requestedScope;

  if (permission.kind === "toc" && permission.user && !canAccessScope(permission.user, scope)) {
    return NextResponse.json({ error: "You do not have permission to view this Odin context." }, { status: 403 });
  }

  const national = permission.kind === "odin" || (permission.kind === "toc" && permission.user && hasNationalAccess(permission.user));
  const regionFilter = scope === "National" || national ? {} : { region: scope };

  const [
    openOdinItems,
    pendingOdinApprovals,
    openActions,
    pendingNationalRequests,
    openStockOrders,
    activeCompliance,
    equipmentWatch,
    productivitySites
  ] = await Promise.all([
    tableCount("odin_items", { status: "pending" }),
    tableCount("odin_items", { status: "pending", approval_required: true }),
    tableCount("action_items", { status: activeActionStatuses }),
    tableCount("national_requests", { status: "pending" }),
    tableCount("stock_orders", { status: "submitted" }),
    tableCount("compliance_items", { status: "open" }),
    tableCount("equipment_assets", { status: "watch" }),
    tableCount("productivity_sites", regionFilter)
  ]);

  return NextResponse.json({
    connected: true,
    scope,
    generatedAt: new Date().toISOString(),
    counts: {
      openOdinItems,
      pendingOdinApprovals,
      openActions,
      pendingNationalRequests,
      openStockOrders,
      activeCompliance,
      equipmentWatch,
      productivitySites
    },
    operatingRhythm: [
      "Morning Brief: today jobs, risks, staffing gaps, key clients and priorities.",
      "Midday Check: off-track work, missing updates and escalation items.",
      "End-of-Day Report: completed work, missing evidence, follow-ups and tomorrow prep.",
      "Weekly Ops Review: patterns, productivity, compliance and repeated weak spots."
    ]
  });
}
