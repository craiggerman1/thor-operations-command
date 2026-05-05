import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { Status } from "@/lib/toc-data";

type ActionStatus = "open" | "submitted_for_review" | "returned_to_manager" | "closed";

type ActionRow = {
  id: string;
  title: string;
  detail: string | null;
  source_page: string;
  directive_type: "National Ops Directive" | "Scheduled Directive" | "To Do";
  priority: "urgent" | "high" | "normal" | "low";
  status: ActionStatus;
  due_at: string | null;
  region?: { name: string } | { name: string }[] | null;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function titleCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceHref(source: string) {
  const map: Record<string, string> = {
    Compliance: "/compliance",
    Productivity: "/operations",
    "Equipment Servicing": "/equipment-servicing",
    "Stock Orders": "/stock-orders",
    "Thor Portal": "/jobsheets",
    Jobsheets: "/jobsheets",
    Roster: "/staff-availability",
    Calendar: "/calendar",
    "To Do": "/todo",
    Workshop: "/equipment-servicing"
  };

  return map[source] || "/actions";
}

function severityForAction(row: ActionRow): Status {
  if (row.directive_type === "National Ops Directive" || row.priority === "urgent" || row.priority === "high") return "red";
  if (row.directive_type === "Scheduled Directive") return "amber";
  return "blue";
}

function displayStatus(status: ActionStatus) {
  const labels = {
    open: "Open",
    submitted_for_review: "Awaiting national review",
    returned_to_manager: "Returned to manager",
    closed: "Closed"
  };

  return labels[status];
}

function displayDueDate(value: string | null) {
  if (!value) return "No due date set";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function mapAction(row: ActionRow) {
  const source = titleCase(row.source_page || "Action Centre");
  const region = firstRelated(row.region);
  const severity = severityForAction(row);

  return {
    id: row.id,
    title: row.title,
    source,
    directive: row.directive_type,
    region: region?.name || "National",
    severity,
    dueDate: displayDueDate(row.due_at),
    href: `/actions/${row.id}`,
    detail: row.detail || "Action item requires manager review and close-out.",
    status: displayStatus(row.status),
    closeFlow: "Complete the required action, record the response, and submit for national approval.",
    closeActions: [
      `Open the source page: ${source}`,
      "Complete the required operational action.",
      "Record the manager response and evidence.",
      "Submit to National Requests for approval."
    ],
    sourceHref: sourceHref(source)
  };
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ actions: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  let query = supabase
    .from("action_items")
    .select("id,title,detail,source_page,directive_type,priority,status,due_at,region:regions(name)")
    .order("created_at", { ascending: false });

  if (id) query = query.eq("id", id);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ actions: [], connected: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ actions: ((data as ActionRow[] | null) || []).map(mapAction), connected: true });
}
