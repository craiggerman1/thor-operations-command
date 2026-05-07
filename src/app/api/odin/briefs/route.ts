import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { buildOdinRosterGaps } from "@/lib/odin-roster-gaps";
import { getSupabaseAdminClient } from "@/lib/supabase";

type BriefType = "morning" | "midday" | "end_of_day" | "weekly";

const briefTypes: BriefType[] = ["morning", "midday", "end_of_day", "weekly"];

function dateOnly(date = new Date(), timeZone = "Australia/Brisbane") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((output, part) => {
    output[part.type] = part.value;
    return output;
  }, {} as Record<string, string>);

  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  return `${year}-${month}-${day}`;
}

function cleanDateOnly(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : dateOnly();
}

function cleanBriefType(value: unknown): BriefType {
  return briefTypes.includes(value as BriefType) ? value as BriefType : "morning";
}

function briefTypeLabel(type: BriefType) {
  if (type === "morning") return "Morning Brief";
  if (type === "midday") return "Midday Check";
  if (type === "end_of_day") return "End-of-Day Closeout";
  return "Weekly Ops Review";
}

function severityFromCounts(redCount: number, amberCount: number) {
  if (redCount > 0) return "red";
  if (amberCount > 0) return "amber";
  return "blue";
}

async function countRows(input: { table: string; statuses?: string[]; statusColumn?: string }) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return 0;

  let query = supabase
    .from(input.table)
    .select("id", { count: "exact", head: true });

  if (input.statuses?.length) query = query.in(input.statusColumn || "status", input.statuses);
  const { count } = await query;
  return count || 0;
}

async function buildGeneratedBrief(type: BriefType, region: string, briefDate = dateOnly()) {
  const [openActions, nationalRequests, stockOrders, complianceItems, rosterGaps] = await Promise.all([
    countRows({ table: "action_items", statuses: ["open", "submitted_for_review", "returned_to_manager"] }),
    countRows({ table: "national_requests", statuses: ["awaiting_review", "returned_to_manager", "pending"] }),
    countRows({ table: "stock_orders", statuses: ["submitted", "awaiting_review", "cancel_requested", "update_requested"] }),
    countRows({ table: "compliance_items", statuses: ["open", "in_progress", "blocked", "not_started"] }),
    buildOdinRosterGaps()
  ]);
  const openRosterGaps = rosterGaps.gaps.filter((gap) => !gap.alreadyActioned && (region === "National" || gap.region === region));
  const redRosterGaps = openRosterGaps.filter((gap) => gap.severity === "red").length;
  const amberCount = openActions + nationalRequests + stockOrders + complianceItems + openRosterGaps.length;
  const severity = severityFromCounts(redRosterGaps, amberCount);
  const typeLabel = briefTypeLabel(type);
  const priorityItems = [
    ...openRosterGaps.slice(0, 4).map((gap) => ({
      title: gap.title,
      region: gap.region,
      severity: gap.severity,
      recommendedAction: gap.recommendedAction,
      href: gap.linkedActionHref || "/national-requests"
    })),
    ...(nationalRequests ? [{ title: "National requests awaiting review", region: "National", severity: "amber", recommendedAction: "Review National Requests queue.", href: "/national-requests" }] : []),
    ...(complianceItems ? [{ title: "Compliance items open", region: "National", severity: "amber", recommendedAction: "Review Compliance and linked Action Centre items.", href: "/compliance" }] : [])
  ].slice(0, 8);

  return {
    briefDate,
    briefType: type,
    region,
    title: `${typeLabel} - ${region}`,
    summary: `${typeLabel}: ${openActions} open action items, ${nationalRequests} national requests, ${stockOrders} stock orders, ${complianceItems} compliance items and ${openRosterGaps.length} roster gaps need visibility.`,
    severity,
    status: "current",
    priorityItems,
    metrics: {
      openActions,
      nationalRequests,
      stockOrders,
      complianceItems,
      rosterGaps: openRosterGaps.length,
      redRosterGaps
    },
    generatedBy: "toc",
    source: "generated"
  };
}

function mapBriefRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    briefDate: row.brief_date,
    briefType: row.brief_type,
    region: row.region,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    status: row.status,
    priorityItems: row.priority_items || [],
    metrics: row.metrics || {},
    generatedBy: row.generated_by,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const region = url.searchParams.get("region") || "National";
  const briefDate = cleanDateOnly(url.searchParams.get("date"));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 80));

  const { data, error } = await supabase
    .from("odin_daily_briefs")
    .select("*")
    .eq("region", region)
    .lte("brief_date", briefDate)
    .order("brief_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ connected: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    connected: true,
    region,
    briefDate,
    briefs: ((data || []) as Record<string, unknown>[]).map(mapBriefRow)
  });
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(payload.action || "upsert");
  const briefType = cleanBriefType(payload.briefType || payload.type);
  const region = String(payload.region || "National");
  const briefData = action === "generate"
    ? await buildGeneratedBrief(briefType, region, cleanDateOnly(payload.briefDate || payload.date))
    : {
      briefDate: cleanDateOnly(payload.briefDate || payload.date),
      briefType,
      region,
      title: String(payload.title || `${briefTypeLabel(briefType)} - ${region}`),
      summary: String(payload.summary || "Odin operating brief created."),
      severity: String(payload.severity || "blue"),
      status: String(payload.status || "current"),
      priorityItems: Array.isArray(payload.priorityItems) ? payload.priorityItems : [],
      metrics: payload.metrics && typeof payload.metrics === "object" ? payload.metrics : {},
      generatedBy: permission.kind === "odin" ? "odin" : "toc",
      source: String(payload.source || (permission.kind === "odin" ? "odin" : "toc"))
    };

  const { data, error } = await supabase
    .from("odin_daily_briefs")
    .upsert({
      brief_date: briefData.briefDate,
      brief_type: briefData.briefType,
      region: briefData.region,
      title: briefData.title,
      summary: briefData.summary,
      severity: briefData.severity,
      status: briefData.status,
      priority_items: briefData.priorityItems,
      metrics: briefData.metrics,
      generated_by: briefData.generatedBy,
      source: briefData.source,
      updated_at: new Date().toISOString()
    }, { onConflict: "brief_date,brief_type,region" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ connected: false, error: error.message }, { status: 500 });

  await logTocAudit({
    actor: permission.kind === "toc" ? permission.user : undefined,
    action: action === "generate" ? "odin.brief.generate" : "odin.brief.upsert",
    entityTable: "odin_daily_briefs",
    entityId: data.id,
    scope: briefData.region,
    details: { briefType: briefData.briefType, actorType: permission.kind }
  });

  return NextResponse.json({ connected: true, action, brief: mapBriefRow(data as Record<string, unknown>) });
}
