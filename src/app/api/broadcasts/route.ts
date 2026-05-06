import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocRole, requireTocUser } from "@/lib/toc-auth";

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
  acknowledgements: Record<string, string[]>;
  directorAcknowledgements: Record<string, string[]>;
  connected?: boolean;
};

const directorSettingsKey = "director_broadcast";
const acknowledgementSettingsKey = "broadcast_acknowledgements";
const directorAcknowledgementSettingsKey = "director_broadcast_acknowledgements";
const defaultState: BroadcastState = {
  urgentBroadcasts: [],
  directorBroadcast: null,
  acknowledgements: {},
  directorAcknowledgements: {}
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

function cleanAcknowledgements(raw: unknown) {
  if (!raw || typeof raw !== "object") return {} as Record<string, string[]>;

  return Object.entries(raw as Record<string, unknown>).reduce((acknowledgements, [version, users]) => {
    acknowledgements[version] = Array.isArray(users) ? Array.from(new Set(users.map(String).filter(Boolean))) : [];
    return acknowledgements;
  }, {} as Record<string, string[]>);
}

async function readSettingValue(key: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;
  return data?.value ?? null;
}

async function writeSettingValue(key: string, value: unknown) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const { error } = await supabase.from("app_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString()
  }, { onConflict: "key" });

  if (error) throw error;
}

async function getDatabaseBroadcastState(): Promise<BroadcastState | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const [{ data: urgentData, error: urgentError }, { data: directorData, error: directorError }, acknowledgements, directorAcknowledgements] = await Promise.all([
    supabase
      .from("urgent_broadcasts")
      .select("id,message,version,active,target_scope,created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", directorSettingsKey)
      .maybeSingle(),
    readSettingValue(acknowledgementSettingsKey),
    readSettingValue(directorAcknowledgementSettingsKey)
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
    acknowledgements: cleanAcknowledgements(acknowledgements),
    directorAcknowledgements: cleanAcknowledgements(directorAcknowledgements),
    connected: true
  };
}

export async function GET(request: Request) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission.error;

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
  const isAcknowledgement = body.kind === "acknowledge" || body.kind === "acknowledge-director";
  const permission = isAcknowledgement
    ? await requireTocUser(request)
    : await requireTocRole(request, body.kind === "director" || body.kind === "clear-director" ? ["admin", "director"] : ["admin"]);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const state = getFallbackBroadcastState();
    if (body.kind === "urgent") state.urgentBroadcasts = cleanUrgentBroadcasts(body.broadcasts);
    if (body.kind === "director") state.directorBroadcast = cleanDirectorBroadcast(body.broadcast);
    if (body.kind === "clear-director") state.directorBroadcast = null;
    if (body.kind === "acknowledge" && body.version && body.userKey) {
      state.acknowledgements = acknowledgeVersion(state.acknowledgements, body.version, body.userKey);
    }
    if (body.kind === "acknowledge-director" && body.version && body.userKey) {
      state.directorAcknowledgements = acknowledgeVersion(state.directorAcknowledgements, body.version, body.userKey);
    }
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
    const auditResult = await logTocAudit({
      actor: permission.user,
      action: "broadcast.urgent.replace",
      entityTable: "urgent_broadcasts",
      scope: broadcasts.some((broadcast) => broadcast.targetScope === "All users") ? "All users" : undefined,
      details: {
        broadcastCount: broadcasts.length,
        activeCount: broadcasts.filter((broadcast) => broadcast.active).length,
        targetScopes: Array.from(new Set(broadcasts.map((broadcast) => broadcast.targetScope)))
      }
    });
    if (!auditResult.ok) return NextResponse.json({ error: auditResult.error }, { status: 500 });
  }

  if (body.kind === "director") {
    const broadcast = cleanDirectorBroadcast(body.broadcast) || { message: "", version: Date.now().toString(), active: false };
    const { error } = await supabase.from("app_settings").upsert({
      key: directorSettingsKey,
      value: broadcast,
      updated_at: new Date().toISOString()
    }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const auditResult = await logTocAudit({
      actor: permission.user,
      action: "broadcast.director.upsert",
      entityTable: "app_settings",
      entityId: directorSettingsKey,
      scope: "National",
      details: {
        active: broadcast.active,
        version: broadcast.version
      }
    });
    if (!auditResult.ok) return NextResponse.json({ error: auditResult.error }, { status: 500 });
  }

  if (body.kind === "clear-director") {
    const { error } = await supabase.from("app_settings").upsert({
      key: directorSettingsKey,
      value: { message: "", version: Date.now().toString(), active: false },
      updated_at: new Date().toISOString()
    }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const auditResult = await logTocAudit({
      actor: permission.user,
      action: "broadcast.director.clear",
      entityTable: "app_settings",
      entityId: directorSettingsKey,
      scope: "National"
    });
    if (!auditResult.ok) return NextResponse.json({ error: auditResult.error }, { status: 500 });
  }

  if (body.kind === "acknowledge") {
    const version = String(body.version || "");
    const userKey = String(body.userKey || "");
    if (!version || !userKey) return NextResponse.json({ error: "Broadcast version and user key are required." }, { status: 400 });
    const currentAcknowledgements = cleanAcknowledgements(await readSettingValue(acknowledgementSettingsKey));
    await writeSettingValue(acknowledgementSettingsKey, acknowledgeVersion(currentAcknowledgements, version, userKey));
  }

  if (body.kind === "acknowledge-director") {
    const version = String(body.version || "");
    const userKey = String(body.userKey || "");
    if (!version || !userKey) return NextResponse.json({ error: "Director broadcast version and user key are required." }, { status: 400 });
    const currentAcknowledgements = cleanAcknowledgements(await readSettingValue(directorAcknowledgementSettingsKey));
    await writeSettingValue(directorAcknowledgementSettingsKey, acknowledgeVersion(currentAcknowledgements, version, userKey));
  }

  const databaseState = await getDatabaseBroadcastState();
  return NextResponse.json(databaseState || { ...defaultState, connected: false });
}

function acknowledgeVersion(acknowledgements: Record<string, string[]>, version: string, userKey: string) {
  const cleanVersion = String(version);
  const cleanUserKey = String(userKey);
  return {
    ...acknowledgements,
    [cleanVersion]: Array.from(new Set([...(acknowledgements[cleanVersion] || []), cleanUserKey]))
  };
}
