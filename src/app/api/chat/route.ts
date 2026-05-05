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

export async function GET() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ messages: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,mode,author,audience,recipients,message,is_own,created_at")
    .order("created_at", { ascending: true })
    .limit(250);

  if (error) {
    return NextResponse.json({ messages: [], connected: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: ((data as ChatMessageRow[] | null) || []).map(mapMessage), connected: true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const action = payload.action || "create";

  if (action === "delete") {
    if (!payload.id) return NextResponse.json({ error: "Chat message id is required." }, { status: 400 });
    const { error } = await supabase.from("chat_messages").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return GET();
  }

  const text = String(payload.text || "").trim();

  if (!text) return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });

  const { error } = await supabase.from("chat_messages").insert({
    mode: payload.mode || "group",
    author: payload.author || "Admin User",
    audience: payload.audience || "System-wide group chat",
    recipients: Array.isArray(payload.recipients) ? payload.recipients : [],
    message: text,
    is_own: Boolean(payload.own)
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return GET();
}
