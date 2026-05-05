import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

type UrgentBroadcastMessage = {
  id: string;
  message: string;
  version: string;
  active: boolean;
  targetScope: string;
};

type DirectorBroadcastMessage = {
  message: string;
  version: string;
  active: boolean;
};

type BroadcastState = {
  urgentBroadcasts: UrgentBroadcastMessage[];
  directorBroadcast: DirectorBroadcastMessage | null;
  connected?: boolean;
};

const directorSettingsKey = "director_broadcast";
const defaultState: BroadcastState = {
  urgentBroadcasts: [],
  directorBroadcast: null
};

const globalBroadcastState = globalThis as typeof globalThis & {
  __tocBroadcastState?: BroadcastState;
};

function getFallbackBroadcastState() {
  if (!globalBroadcastState.__tocBroadcastState) {
    globalBroadcastState.__tocBroadcastState = defaultState;
  }

  return globalBroadcastState.__tocBroadcastState;
}

function cleanUrgentBroadcasts(raw: unknown) {
  if (!Array.isArray(raw)) return [] as UrgentBroadcastMessage[];

  return raw.map((item) => {
    const broadcast = item as Partial<UrgentBroadcastMessage>;
    return {
      id: broadcast.id || `urgent-${Date.now()}`,
      message: broadcast.message || "",
      version: broadcast.version || Date.now().toString(),
      active: Boolean(broadcast.active),
      targetScope: broadcast.targetScope || "All users"
    };
  });
}

function cleanDirectorBroadcast(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;

  const broadcast = raw as Partial<DirectorBroadcastMessage>;
  return {
    message: broadcast.message || "",
    version: broadcast.version || Date.now().toString(),
    active: Boolean(broadcast.active)
  };
}

async function getDatabaseBroadcastState(): Promise<BroadcastState | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const [{ data: urgentData, error: urgentError }, { data: directorData, error: directorError }] = await Promise.all([
    supabase
      .from("urgent_broadcasts")
      .select("id,message,version,active,target_scope,created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", directorSettingsKey)
      .maybeSingle()
  ]);

  if (urgentError || directorError) {
    throw new Error(urgentError?.message || directorError?.message || "Broadcast database read failed.");
  }

  return {
    urgentBroadcasts: (urgentData || []).map((broadcast) => ({
      id: broadcast.id,
      message: broadcast.message,
      version: broadcast.version,
      active: Boolean(broadcast.active),
      targetScope: broadcast.target_scope || "All users"
    })),
    directorBroadcast: cleanDirectorBroadcast(directorData?.value),
    connected: true
  };
}

export async function GET() {
  try {
    const databaseState = await getDatabaseBroadcastState();
    if (databaseState) return NextResponse.json(databaseState);
  } catch (error) {
    return NextResponse.json({ ...getFallbackBroadcastState(), connected: false, error: error instanceof Error ? error.message : "Broadcast database read failed." }, { status: 500 });
  }

  return NextResponse.json({ ...getFallbackBroadcastState(), connected: false });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const state = getFallbackBroadcastState();
    if (body.kind === "urgent") state.urgentBroadcasts = cleanUrgentBroadcasts(body.broadcasts);
    if (body.kind === "director") state.directorBroadcast = cleanDirectorBroadcast(body.broadcast);
    if (body.kind === "clear-director") state.directorBroadcast = null;
    return NextResponse.json({ ...state, connected: false });
  }

  if (body.kind === "urgent") {
    const broadcasts = cleanUrgentBroadcasts(body.broadcasts);
    const { error: deleteError } = await supabase.from("urgent_broadcasts").delete().neq("id", "__never__");
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (broadcasts.length) {
      const { error: insertError } = await supabase.from("urgent_broadcasts").insert(broadcasts.map((broadcast) => ({
        id: broadcast.id,
        message: broadcast.message,
        version: broadcast.version,
        active: broadcast.active,
        target_scope: broadcast.targetScope,
        updated_at: new Date().toISOString()
      })));
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  if (body.kind === "director") {
    const broadcast = cleanDirectorBroadcast(body.broadcast) || { message: "", version: Date.now().toString(), active: false };
    const { error } = await supabase.from("app_settings").upsert({
      key: directorSettingsKey,
      value: broadcast,
      updated_at: new Date().toISOString()
    }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.kind === "clear-director") {
    const { error } = await supabase.from("app_settings").upsert({
      key: directorSettingsKey,
      value: { message: "", version: Date.now().toString(), active: false },
      updated_at: new Date().toISOString()
    }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const databaseState = await getDatabaseBroadcastState();
  return NextResponse.json(databaseState || { ...defaultState, connected: false });
}
