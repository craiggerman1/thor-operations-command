import { getSupabaseAdminClient } from "@/lib/supabase";

type RegionRow = {
  id: string;
  name: string;
  is_active?: boolean;
};

export function odinIdsFromPayload(payload: Record<string, unknown>, names: string[] = []) {
  const rawIds = names.reduce<unknown>((value, name) => value || payload[name], undefined) || payload.ids || payload.id;
  const ids = (Array.isArray(rawIds) ? rawIds : [rawIds])
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

export function odinOperation(value: unknown, allowed: string[]) {
  const operation = String(value || "create").trim().toLowerCase();
  if (allowed.includes(operation)) return operation;
  throw new Error(`Unsupported Odin operation: ${operation || "empty"}.`);
}

export function odinDueToIso(value: unknown) {
  if (value === null) return null;
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = raw.includes("T") ? new Date(raw) : new Date(`${raw}T17:00:00+10:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function odinNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function odinRegionId(regionName: unknown) {
  const region = String(regionName || "National").trim();
  if (!region || region === "National") return null;

  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const { data, error } = await supabase
    .from("regions")
    .select("id,name")
    .eq("name", region)
    .maybeSingle();

  if (error) throw error;
  return (data as RegionRow | null)?.id || null;
}

export async function odinActiveRegionNames() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const { data, error } = await supabase
    .from("regions")
    .select("name,is_active")
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data as RegionRow[] | null) || []).filter((region) => region.is_active !== false).map((region) => region.name);
}
