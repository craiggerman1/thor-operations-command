import { NextResponse } from "next/server";
import type { OdinPermission } from "@/lib/odin-auth";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const odinControlSettingsKey = "odin_control_settings";

export type OdinControlSettings = {
  overwatchEnabled: boolean;
  managerEscalations: Record<string, boolean>;
  updatedAt?: string;
  updatedBy?: string;
};

export const defaultOdinControlSettings: OdinControlSettings = {
  overwatchEnabled: true,
  managerEscalations: {}
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normaliseOdinControlSettings(value: unknown): OdinControlSettings {
  const source = isRecord(value) ? value : {};
  const rawManagerEscalations = isRecord(source.managerEscalations) ? source.managerEscalations : {};
  const managerEscalations = Object.fromEntries(
    Object.entries(rawManagerEscalations)
      .map(([id, enabled]) => [id, enabled === true])
      .filter(([id]) => Boolean(id))
  );

  return {
    overwatchEnabled: source.overwatchEnabled === false ? false : true,
    managerEscalations,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : undefined,
    updatedBy: typeof source.updatedBy === "string" ? source.updatedBy : undefined
  };
}

export async function readOdinControlSettings() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      connected: false,
      settings: defaultOdinControlSettings,
      error: "Supabase server key is not configured."
    };
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", odinControlSettingsKey)
    .maybeSingle();

  if (error) {
    return {
      connected: false,
      settings: defaultOdinControlSettings,
      error: error.message
    };
  }

  return {
    connected: true,
    settings: normaliseOdinControlSettings(data?.value),
    error: null
  };
}

export async function saveOdinControlSettings(settings: OdinControlSettings) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server key is not configured.");

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: odinControlSettingsKey, value: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) throw error;
}

export async function blockOdinWriteIfOverwatchPaused(permission: OdinPermission) {
  if (permission.kind !== "odin") return null;

  const { settings } = await readOdinControlSettings();
  if (settings.overwatchEnabled) return null;

  return NextResponse.json({
    connected: false,
    error: "Odin Overwatch is paused from Odin Control. Odin service writes are blocked until Admin or National turns Overwatch back on."
  }, { status: 423 });
}
