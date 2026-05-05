import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { Status } from "@/lib/toc-data";

type ComplianceRow = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  due_at: string | null;
  linked_action_id: string | null;
  region?: { name: string } | { name: string }[] | null;
};

type ActionRow = {
  id: string;
  title: string;
  detail: string | null;
  directive_type: "National Ops Directive" | "Scheduled Directive" | "To Do";
  priority: string;
  status: string;
  due_at: string | null;
  region?: { name: string } | { name: string }[] | null;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function severityForAction(action: ActionRow): Status {
  if (action.priority === "urgent" || action.priority === "high" || action.directive_type === "National Ops Directive") return "red";
  if (action.directive_type === "Scheduled Directive") return "amber";
  return "blue";
}

function displayDueDate(value: string | null) {
  if (!value) return "No due date set";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function mapAction(action: ActionRow) {
  const region = firstRelated(action.region);
  const severity = severityForAction(action);

  return {
    id: action.id,
    title: action.title,
    source: "Compliance",
    directive: action.directive_type,
    region: region?.name || "National",
    severity,
    dueDate: displayDueDate(action.due_at),
    href: `/actions/${action.id}`,
    detail: action.detail || "Compliance action requires manager close-out.",
    status: action.status === "submitted_for_review" ? "Awaiting national review" : action.status === "returned_to_manager" ? "Returned to manager" : "Open"
  };
}

function mapRegisterItem(item: ComplianceRow) {
  const region = firstRelated(item.region);

  return {
    id: item.id,
    title: item.title,
    detail: item.detail || "No additional compliance detail supplied.",
    region: region?.name || "National",
    status: item.status,
    dueDate: displayDueDate(item.due_at),
    actionHref: item.linked_action_id ? `/actions/${item.linked_action_id}` : "/compliance"
  };
}

export async function GET() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ actions: [], register: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const [{ data: actionData, error: actionError }, { data: registerData, error: registerError }] = await Promise.all([
    supabase
      .from("action_items")
      .select("id,title,detail,directive_type,priority,status,due_at,region:regions(name)")
      .eq("source_page", "compliance")
      .neq("status", "closed")
      .order("created_at", { ascending: false }),
    supabase
      .from("compliance_items")
      .select("id,title,detail,status,due_at,linked_action_id,region:regions(name)")
      .order("created_at", { ascending: false })
  ]);

  if (actionError || registerError) {
    return NextResponse.json({ actions: [], register: [], connected: false, error: actionError?.message || registerError?.message }, { status: 500 });
  }

  return NextResponse.json({
    actions: ((actionData as ActionRow[] | null) || []).map(mapAction),
    register: ((registerData as ComplianceRow[] | null) || []).map(mapRegisterItem),
    connected: true
  });
}
