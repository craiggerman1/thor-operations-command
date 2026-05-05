import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

const settingsKey = "page_hints";

type PageHintState = {
  enabled: boolean;
  version: string;
  connected?: boolean;
};

const defaultState: PageHintState = {
  enabled: true,
  version: "0.062"
};

function cleanState(raw: unknown): PageHintState {
  if (!raw || typeof raw !== "object") return defaultState;

  const state = raw as Partial<PageHintState>;
  return {
    enabled: state.enabled !== false,
    version: state.version || defaultState.version
  };
}

export async function GET() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ...defaultState, connected: false });

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", settingsKey)
    .maybeSingle();

  if (error) return NextResponse.json({ ...defaultState, connected: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ...cleanState(data?.value), connected: true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const nextState = cleanState({
    enabled: body.enabled,
    version: body.version || Date.now().toString()
  });

  const { error } = await supabase
    .from("app_settings")
    .upsert({
      key: settingsKey,
      value: nextState,
      updated_at: new Date().toISOString()
    }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...nextState, connected: true });
}
