import { NextResponse } from "next/server";
import { buildOdinRosterGaps } from "@/lib/odin-roster-gaps";
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
type ComplianceRow = {
  status: string;
  region?: { name: string } | { name: string }[] | null;
};

const badgeCache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();
const badgeCacheMs = 20000;

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
  const cacheKey = `${role}:${scope}`;
  const cached = badgeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  const [{ data: actionData }, { data: requestData }, { data: stockData }, { data: todoData }, { data: complianceData }, rosterGaps] = await Promise.all([
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
      .from("compliance_items")
      .select("status,region:regions(name)")
      .neq("status", "complete"),
    buildOdinRosterGaps()
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
  const openComplianceRegisterCount = ((complianceData as ComplianceRow[] | null) || []).filter((item) => {
    const region = firstRelated(item.region);
    return scope === "National" || region?.name === scope;
  }).length;
  const complianceBadgeCount = Math.max(countBySource(["Compliance"]), openComplianceRegisterCount);
  const nationalRequestCount = scope === "National" ? ((requestData as { status: string }[] | null) || []).length + scopedStock.length : 0;
  const todoCount = ((todoData as TodoRow[] | null) || []).filter((item) => isTodoVisibleForScope(item, role, scope)).length;
  const scopedRosterGaps = rosterGaps.gaps.filter((gap) => (scope === "National" || gap.region === scope) && !gap.alreadyActioned);
  const redRosterGapCount = scopedRosterGaps.filter((gap) => gap.severity === "red").length;
  const rosterGapTone = redRosterGapCount ? "red" : scopedRosterGaps.length ? "amber" : "blue";

  const payload = {
    connected: true,
    badges: {
      "Action Centre": makeBadge(scopedActions.length, urgentActionCount ? "red" : "amber"),
      "Region Health": makeBadge(scopedActions.length, urgentActionCount ? "red" : "amber"),
      "Equipment Servicing": makeBadge(countBySource(["Equipment Servicing", "Workshop"]), "amber"),
      Compliance: makeBadge(complianceBadgeCount, complianceBadgeCount ? "red" : "blue"),
      "Staff Availability": makeBadge(scopedRosterGaps.length || countBySource(["Roster"]), rosterGapTone),
      Jobsheets: makeBadge(countBySource(["Thor Portal", "Jobsheets"]), "amber"),
      "Stock Orders": makeBadge(scopedStock.length, scopedStock.length > 2 ? "red" : "amber"),
      "To Do": makeBadge(todoCount || countByDirective(["To Do"]), todoCount ? "blue" : "blue"),
      "National Requests": makeBadge(nationalRequestCount + (scope === "National" ? scopedRosterGaps.length : 0), redRosterGapCount || nationalRequestCount ? "red" : rosterGapTone)
    }
  };
  badgeCache.set(cacheKey, { expiresAt: Date.now() + badgeCacheMs, payload });
  return NextResponse.json(payload);
}
