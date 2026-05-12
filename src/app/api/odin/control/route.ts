import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { normaliseOdinControlSettings, readOdinControlSettings, saveOdinControlSettings } from "@/lib/odin-control";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ManagerContactRow = {
  id: string;
  display_name: string;
  email: string | null;
  access_level: string;
  is_active: boolean;
  contact_mobile: string | null;
  contact_whatsapp: string | null;
  profile_regions?: Array<{ region?: { name: string } | { name: string }[] | null }> | null;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function readManagerContacts(managerEscalations: Record<string, boolean>) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { managers: [], error: "Supabase server key is not configured." };

  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,email,access_level,is_active,contact_mobile,contact_whatsapp,profile_regions(region:regions(name))")
    .in("access_level", ["admin", "manager", "director", "national"])
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) return { managers: [], error: error.message };

  const managers = ((data || []) as ManagerContactRow[]).map((profile) => {
    const regions = (profile.profile_regions || [])
      .map((item) => firstRelated(item.region)?.name)
      .filter(Boolean) as string[];
    const whatsapp = profile.contact_whatsapp || profile.contact_mobile || "";

    return {
      id: profile.id,
      name: profile.display_name,
      email: profile.email || "",
      role: profile.access_level,
      regions,
      mobile: profile.contact_mobile || "",
      whatsapp,
      hasContact: Boolean(whatsapp),
      escalationEnabled: managerEscalations[profile.id] === true
    };
  });

  return { managers, error: null };
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const { connected, settings, error } = await readOdinControlSettings();
  const managerResult = await readManagerContacts(settings.managerEscalations);

  return NextResponse.json({
    connected: connected && !managerResult.error,
    error: error || managerResult.error,
    control: {
      overwatchEnabled: settings.overwatchEnabled,
      managerEscalations: settings.managerEscalations,
      updatedAt: settings.updatedAt || null,
      updatedBy: settings.updatedBy || null
    },
    managers: managerResult.managers
  });
}

export async function PATCH(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;
  if (permission.kind === "odin") {
    return NextResponse.json({ error: "Only authenticated Admin or National TOC users can change Odin Control settings." }, { status: 403 });
  }

  const payload = await request.json().catch(() => ({}));
  const current = await readOdinControlSettings();
  const next = normaliseOdinControlSettings(current.settings);
  const changedFields: string[] = [];

  if (typeof payload.overwatchEnabled === "boolean") {
    next.overwatchEnabled = payload.overwatchEnabled;
    changedFields.push("overwatchEnabled");
  }

  if (typeof payload.managerId === "string" && typeof payload.escalationEnabled === "boolean") {
    const managerId = payload.managerId.trim();
    if (!managerId) return NextResponse.json({ error: "Manager id is required." }, { status: 400 });
    next.managerEscalations = { ...next.managerEscalations, [managerId]: payload.escalationEnabled };
    changedFields.push(`managerEscalations.${managerId}`);
  }

  if (!changedFields.length) {
    return NextResponse.json({ error: "No Odin Control setting was changed." }, { status: 400 });
  }

  next.updatedAt = new Date().toISOString();
  next.updatedBy = permission.user.id;

  try {
    await saveOdinControlSettings(next);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Odin Control settings could not be saved." }, { status: 500 });
  }

  await logTocAudit({
    actor: permission.user,
    action: "odin.control.update",
    entityTable: "app_settings",
    entityId: "odin_control_settings",
    details: {
      changedFields,
      overwatchEnabled: next.overwatchEnabled,
      enabledManagerEscalations: Object.values(next.managerEscalations).filter(Boolean).length
    }
  });

  const managerResult = await readManagerContacts(next.managerEscalations);
  return NextResponse.json({
    connected: !managerResult.error,
    control: {
      overwatchEnabled: next.overwatchEnabled,
      managerEscalations: next.managerEscalations,
      updatedAt: next.updatedAt,
      updatedBy: next.updatedBy
    },
    managers: managerResult.managers,
    error: managerResult.error
  });
}
