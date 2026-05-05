import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

type ChatMode = "group" | "direct" | "multi";

type ChatMessageRow = {
  id: string;
  mode: ChatMode;
  author: string;
  audience: string;
  recipients: string[];
  message: string;
  is_own: boolean;
  created_at: string;
};

function mapMessage(row: ChatMessageRow) {
  const createdAt = new Date(row.created_at);

  return {
    id: row.id,
    mode: row.mode,
    author: row.author,
    audience: row.audience,
    recipients: row.recipients || [],
    text: row.message,
    time: new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }).format(createdAt),
    own: row.is_own,
    createdAt: row.created_at
  };
}

function getScopeId(scope: string) {
  return scope.toLowerCase().replace(/\s+/g, "-");
}

function normaliseMode(value: string): ChatMode {
  if (value === "direct" || value === "multi") return value;
  return "group";
}

function isVisibleForSession(row: ChatMessageRow, role: string, scope: string, all: boolean) {
  if (all || role === "admin" || role === "director" || scope === "National") return true;
  if (row.mode === "group") return true;
  return (row.recipients || []).includes(getScopeId(scope));
}

async function readMessages(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { messages: [], connected: false, error: "Supabase server key is not configured." };
  }

  const url = new URL(request.url);
  const role = url.searchParams.get("role") || "admin";
  const scope = url.searchParams.get("scope") || "National";
  const all = url.searchParams.get("all") === "true";
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,mode,author,audience,recipients,message,is_own,created_at")
    .order("created_at", { ascending: true })
    .limit(250);

  if (error) {
    return { messages: [], connected: false, error: error.message };
  }

  const rows = ((data as ChatMessageRow[] | null) || []).filter((row) => isVisibleForSession(row, role, scope, all));
  return { messages: rows.map(mapMessage), connected: true };
}

export async function GET(request: Request) {
  const result = await readMessages(request);
  return NextResponse.json(result, { status: result.connected ? 200 : 503 });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";
  const role = payload.role || "admin";
  const scope = payload.scope || "National";
  const all = Boolean(payload.all);

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "Chat message id is required." }, { status: 400 });
    const { error } = await supabase.from("chat_messages").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET(new Request(`${request.url}?role=${encodeURIComponent(role)}&scope=${encodeURIComponent(scope)}${all ? "&all=true" : ""}`));
  }

  const text = String(payload.text || "").trim();

  if (!text) return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });

  const { error } = await supabase.from("chat_messages").insert({
    mode: normaliseMode(payload.mode || "group"),
    author: payload.author || "Admin User",
    audience: payload.audience || "System-wide group chat",
    recipients: Array.isArray(payload.recipients) ? payload.recipients : [],
    message: text,
    is_own: Boolean(payload.own)
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return GET(new Request(`${request.url}?role=${encodeURIComponent(role)}&scope=${encodeURIComponent(scope)}${all ? "&all=true" : ""}`));
}
