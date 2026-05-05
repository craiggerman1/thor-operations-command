import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocRole } from "@/lib/toc-auth";

const defaultItems = ["Thor Operations Currently Normal"];
const settingsKey = "operations_news";

function cleanItems(raw: unknown) {
  if (!Array.isArray(raw)) return defaultItems;

  const cleanLines = raw.map((item) => String(item).trim()).filter(Boolean);
  return cleanLines.length ? cleanLines : defaultItems;
}

export async function GET() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ items: defaultItems, connected: false });

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", settingsKey)
    .maybeSingle();

  if (error) return NextResponse.json({ items: defaultItems, connected: false, error: error.message }, { status: 500 });

  const value = data?.value as { items?: unknown } | null;
  return NextResponse.json({ items: cleanItems(value?.items), connected: true });
}

export async function POST(request: Request) {
  const permission = await requireTocRole(request, ["admin"]);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const items = cleanItems(body.items);
  const { error } = await supabase
    .from("app_settings")
    .upsert({
      key: settingsKey,
      value: { items },
      updated_at: new Date().toISOString()
    }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items, connected: true });
}
