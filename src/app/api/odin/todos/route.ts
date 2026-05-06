import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { normaliseOdinTargetRegions } from "@/lib/odin-actions";
import { getSupabaseAdminClient } from "@/lib/supabase";

type RegionRow = {
  id: string;
  name: string;
  is_active?: boolean;
};

function shareTargetForRegion(region: string) {
  if (region === "National") return "National Ops";
  if (region === "Workshop") return "Workshop";
  return `${region} Manager`;
}

async function getTodoTargetRegions(targetRegions: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const wantsAllManagers = targetRegions.some((region) => ["all", "all managers", "all regions"].includes(region.toLowerCase()));
  const { data, error } = await supabase
    .from("regions")
    .select("name,is_active")
    .order("name", { ascending: true });

  if (error) throw error;

  const activeRegions = ((data as RegionRow[] | null) || []).filter((region) => region.is_active !== false);
  if (wantsAllManagers) return activeRegions.filter((region) => region.name !== "National").map((region) => region.name);

  return Array.from(new Set(targetRegions.map((targetName) => {
    if (targetName.toLowerCase() === "head office") return "National";
    if (targetName === "National") return "National";
    return activeRegions.find((region) => region.name.toLowerCase() === targetName.toLowerCase())?.name || null;
  }).filter(Boolean) as string[]));
}

function dueToIso(value: unknown) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = raw.includes("T") ? new Date(raw) : new Date(`${raw}T17:00:00+10:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));
  const title = String(payload.title || payload.text || payload.reminder || "").trim();
  if (!title) return NextResponse.json({ error: "To Do reminder title is required." }, { status: 400 });

  const targetRegions = await getTodoTargetRegions(normaliseOdinTargetRegions(payload.targetRegions || payload.regions || payload.region));
  if (!targetRegions.length) return NextResponse.json({ error: "No valid To Do target regions supplied." }, { status: 400 });

  const dueAt = dueToIso(payload.dueDate || payload.dueAt);
  const detailSuffix = dueAt ? ` Due ${new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(dueAt))}.` : "";
  const rows = targetRegions.map((region) => ({
    title: `${title}${detailSuffix}`,
    is_done: false,
    is_important: payload.important !== false,
    shared_with: shareTargetForRegion(region),
    owner_role: "manager",
    owner_scope: region
  }));

  const { data, error } = await supabase
    .from("todo_items")
    .insert(rows)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const createdTodoIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);

  await logTocAudit({
    actor: permission.kind === "toc" ? permission.user : undefined,
    action: "odin.todo.direct_create",
    entityTable: "todo_items",
    entityId: createdTodoIds[0],
    scope: targetRegions.join(", "),
    details: {
      title,
      targetRegions,
      createdTodoIds,
      actorType: permission.kind
    }
  });

  return NextResponse.json({
    connected: true,
    createdTodoIds,
    createdCount: createdTodoIds.length,
    targetRegions
  });
}
