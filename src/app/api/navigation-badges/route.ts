import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { resolvePermittedScope, requireTocUser } from "@/lib/toc-auth";

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
type TodoRow = {
  is_done: boolean;
  shared_with: string | null;
  owner_role: string | null;
  owner_scope: string | null;
};
type OdinRow = {
  status: string;
  approval_required: boolean;
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

function getSharedTargets(role: string, scope: string) {
  const targets = new Set<string>([role]);

  if (scope === "National") {
    targets.add("National Ops");
    targets.add("National Manager");
  }

  if (role === "director") targets.add("Director");
  if (scope) {
    targets.add(scope);
    targets.add(`${scope} Manager`);
  }

  return targets;
}

function isTodoVisibleForScope(item: TodoRow, role: string, scope: string) {
  const ownerMatches = item.owner_role === role && item.owner_scope === scope;
  const sharedMatches = item.shared_with ? getSharedTargets(role, scope).has(item.shared_with) : false;
  return !item.is_done && (ownerMatches || sharedMatches);
}

export async function GET(request: Request) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ badges: {}, connected: false }, { status: 503 });
  }

  const url = new URL(request.url);
  const scope = resolvePermittedScope(permission.user, url.searchParams.get("scope"));
  const role = permission.user.role;

  const [{ data: actionData }, { data: requestData }, { data: stockData }, { data: todoData }, { data: odinData }] = await Promise.all([
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
      .in("status", ["submitted", "awaiting_review", "cancel_requested"]),
    supabase
      .from("todo_items")
      .select("is_done,shared_with,owner_role,owner_scope"),
    supabase
      .from("odin_items")
      .select("status,approval_required")
      .eq("status", "pending")
      .eq("approval_required", true)
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
  const todoCount = ((todoData as TodoRow[] | null) || []).filter((item) => isTodoVisibleForScope(item, role, scope)).length;
  const odinApprovalCount = scope === "National" || role === "admin" ? ((odinData as OdinRow[] | null) || []).length : 0;

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
      "To Do": makeBadge(todoCount || countByDirective(["To Do"]), todoCount ? "blue" : "blue"),
      "National Requests": makeBadge(nationalRequestCount, "red"),
      "Odin Command": makeBadge(odinApprovalCount, "red")
    }
  });
}
