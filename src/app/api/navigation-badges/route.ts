import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

type BadgeTone = "red" | "amber" | "blue";
type ActionRow = {
  source_page: string;
  directive_type: string;
  priority: string;
  status: string;
  region?: { name: string } | { name: string }[] | null;
};
type StockRow = {
  status: string;
  region?: { name: string } | { name: string }[] | null;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function makeBadge(count: number, tone: BadgeTone = "blue") {
  return { count, tone };
}

function sourceLabel(source: string) {
  return source.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ badges: {}, connected: false }, { status: 503 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "National";

  const [{ data: actionData }, { data: requestData }, { data: stockData }] = await Promise.all([
    supabase
      .from("action_items")
      .select("source_page,directive_type,priority,status,region:regions(name)")
      .neq("status", "closed"),
    supabase
      .from("national_requests")
      .select("status")
      .eq("status", "awaiting_review"),
    supabase
      .from("stock_orders")
      .select("status,region:regions(name)")
      .in("status", ["submitted", "awaiting_review", "cancel_requested"])
  ]);

  const scopedActions = ((actionData as ActionRow[] | null) || []).filter((item) => {
    const region = firstRelated(item.region);
    return scope === "National" || region?.name === scope;
  });
  const scopedStock = ((stockData as StockRow[] | null) || []).filter((item) => {
    const region = firstRelated(item.region);
    return scope === "National" || region?.name === scope;
  });
  const urgentActionCount = scopedActions.filter((item) => item.priority === "urgent" || item.priority === "high" || item.directive_type === "National Ops Directive").length;
  const countBySource = (sources: string[]) => scopedActions.filter((item) => sources.includes(sourceLabel(item.source_page))).length;
  const countByDirective = (directives: string[]) => scopedActions.filter((item) => directives.includes(item.directive_type)).length;
  const nationalRequestCount = scope === "National" ? ((requestData as { status: string }[] | null) || []).length + scopedStock.length : 0;

  return NextResponse.json({
    connected: true,
    badges: {
      "Action Centre": makeBadge(scopedActions.length, urgentActionCount ? "red" : "amber"),
      "Region Health": makeBadge(scopedActions.length, urgentActionCount ? "red" : "amber"),
      "Equipment Servicing": makeBadge(countBySource(["Equipment Servicing", "Workshop"]), "amber"),
      Compliance: makeBadge(countBySource(["Compliance"]), countBySource(["Compliance"]) ? "red" : "blue"),
      "Staff Availability": makeBadge(countBySource(["Roster"]), "amber"),
      Jobsheets: makeBadge(countBySource(["Thor Portal", "Jobsheets"]), "amber"),
      "Stock Orders": makeBadge(scopedStock.length, scopedStock.length > 2 ? "red" : "amber"),
      "To Do": makeBadge(countByDirective(["To Do"]), "blue"),
      "National Requests": makeBadge(nationalRequestCount, "red")
    }
  });
}
