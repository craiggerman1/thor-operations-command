import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocUser } from "@/lib/toc-auth";

type TodoRow = {
  id: string;
  title: string;
  is_done: boolean;
  is_important: boolean;
  shared_with: string | null;
  owner_role: string | null;
  owner_scope: string | null;
  created_at: string;
  updated_at: string;
};

function mapTodo(row: TodoRow) {
  return {
    id: row.id,
    text: row.title,
    done: row.is_done,
    important: row.is_important,
    sharedWith: row.shared_with || undefined,
    ownerRole: row.owner_role || "admin",
    ownerScope: row.owner_scope || "National",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getScopedQueryParams(request: Request) {
  const url = new URL(request.url);
  return {
    role: url.searchParams.get("role") || "admin",
    scope: url.searchParams.get("scope") || "National"
  };
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

  return Array.from(targets);
}

async function readTodos(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { todos: [], connected: false, error: "Supabase server key is not configured." };
  }

  const { role, scope } = getScopedQueryParams(request);
  const url = new URL(request.url);
  let query = supabase
    .from("todo_items")
    .select("id,title,is_done,is_important,shared_with,owner_role,owner_scope,created_at,updated_at")
    .order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) return { todos: [], connected: false, error: error.message };
  const rows = (data as TodoRow[] | null) || [];
  const visibleRows = url.searchParams.get("all") === "true"
    ? rows
    : rows.filter((item) => {
      const ownerMatches = item.owner_role === role && item.owner_scope === scope;
      const sharedMatches = item.shared_with ? getSharedTargets(role, scope).includes(item.shared_with) : false;
      return ownerMatches || sharedMatches;
    });

  return { todos: visibleRows.map(mapTodo), connected: true };
}

export async function GET(request: Request) {
  const result = await readTodos(request);
  return NextResponse.json(result, { status: result.connected ? 200 : 503 });
}

export async function POST(request: Request) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";
  const role = payload.role || "admin";
  const scope = payload.scope || "National";

  if (action === "create") {
    const title = String(payload.text || "").trim();
    if (!title) return NextResponse.json({ error: "To Do item cannot be empty." }, { status: 400 });

    const { error } = await supabase.from("todo_items").insert({
      title,
      is_done: false,
      is_important: Boolean(payload.important),
      shared_with: payload.sharedWith || null,
      owner_role: role,
      owner_scope: scope
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(new Request(`${request.url}?role=${encodeURIComponent(role)}&scope=${encodeURIComponent(scope)}`));
  }

  if (action === "update") {
    const id = payload.id;
    if (!id) return NextResponse.json({ error: "To Do item id is required." }, { status: 400 });

    const updates: Record<string, string | boolean | null> = { updated_at: new Date().toISOString() };
    if (typeof payload.text === "string") updates.title = payload.text.trim();
    if (typeof payload.done === "boolean") updates.is_done = payload.done;
    if (typeof payload.important === "boolean") updates.is_important = payload.important;
    if ("sharedWith" in payload) updates.shared_with = payload.sharedWith || null;
    if (typeof payload.ownerRole === "string") updates.owner_role = payload.ownerRole;
    if (typeof payload.ownerScope === "string") updates.owner_scope = payload.ownerScope;

    const { error } = await supabase.from("todo_items").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(new Request(`${request.url}?role=${encodeURIComponent(role)}&scope=${encodeURIComponent(scope)}${payload.all ? "&all=true" : ""}`));
  }

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "To Do item id is required." }, { status: 400 });
    const { error } = await supabase.from("todo_items").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(new Request(`${request.url}?role=${encodeURIComponent(role)}&scope=${encodeURIComponent(scope)}${payload.all ? "&all=true" : ""}`));
  }

  return NextResponse.json({ error: "Unsupported To Do action." }, { status: 400 });
}
