import { getSupabaseAdminClient } from "@/lib/supabase";

type Cadence = "weekly" | "monthly" | "annual";

type RegionRow = {
  id: string;
  name: string;
};

type ScheduleRow = {
  id: string;
  title: string;
  detail: string | null;
  directive_type: string;
  priority: string;
  cadence: Cadence;
  interval_months: number | null;
  region_id: string | null;
  next_due_at: string;
};

type OpenOccurrenceRow = {
  id: string;
  linked_action_id: string | null;
};

export function dueToIso(value: string | null | undefined) {
  return value ? new Date(`${value}T17:00:00+10:00`).toISOString() : null;
}

export function addComplianceInterval(value: string, cadence: Cadence, intervalMonths = 1) {
  const next = new Date(value);

  if (cadence === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (cadence === "annual") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + Math.max(1, intervalMonths));
  }

  return next.toISOString();
}

export function normaliseCadence(value: string): Cadence {
  if (value === "weekly" || value === "monthly" || value === "annual") return value;
  return "monthly";
}

export function normaliseIntervalMonths(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(24, Math.max(1, Math.floor(parsed)));
}

export async function getRegionId(regionName: string) {
  if (!regionName || regionName === "National") return null;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("regions")
    .select("id,name")
    .eq("name", regionName)
    .maybeSingle();

  if (error) throw error;
  return (data as RegionRow | null)?.id || null;
}

export async function createRecurringComplianceOccurrence(schedule: ScheduleRow, dueAt = schedule.next_due_at) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data: registerItem, error: registerError } = await supabase
    .from("compliance_items")
    .insert({
      title: schedule.title,
      detail: schedule.detail || "Recurring compliance action requires manager close-out.",
      region_id: schedule.region_id,
      status: "open",
      due_at: dueAt,
      recurrence_schedule_id: schedule.id,
      scheduled_for: dueAt
    })
    .select("id")
    .single();

  if (registerError) throw registerError;

  const { data: actionItem, error: actionError } = await supabase
    .from("action_items")
    .insert({
      title: schedule.title,
      detail: schedule.detail || "Recurring compliance action requires manager close-out.",
      source_page: "compliance",
      directive_type: schedule.directive_type || "Scheduled Directive",
      priority: schedule.priority || "normal",
      status: "open",
      assigned_region_id: schedule.region_id,
      due_at: dueAt
    })
    .select("id")
    .single();

  if (actionError) throw actionError;

  const { error: linkError } = await supabase
    .from("compliance_items")
    .update({ linked_action_id: actionItem.id, updated_at: new Date().toISOString() })
    .eq("id", registerItem.id);

  if (linkError) throw linkError;
  return { registerItemId: registerItem.id as string, actionItemId: actionItem.id as string };
}

export async function ensureRecurringComplianceActions() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from("compliance_action_schedules")
      .select("id,title,detail,directive_type,priority,cadence,interval_months,region_id,next_due_at")
      .eq("active", true)
      .lte("next_due_at", new Date().toISOString())
      .order("next_due_at", { ascending: true })
      .limit(50);

    if (error) throw error;

    for (const schedule of ((data as ScheduleRow[] | null) || [])) {
      const { data: openOccurrence, error: occurrenceError } = await supabase
        .from("compliance_items")
        .select("id,linked_action_id")
        .eq("recurrence_schedule_id", schedule.id)
        .neq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (occurrenceError) throw occurrenceError;
      if ((openOccurrence as OpenOccurrenceRow | null)?.id) continue;

      await createRecurringComplianceOccurrence(schedule, schedule.next_due_at);
      await supabase
        .from("compliance_action_schedules")
        .update({
          last_generated_at: schedule.next_due_at,
          next_due_at: addComplianceInterval(schedule.next_due_at, schedule.cadence, schedule.interval_months || 1),
          updated_at: new Date().toISOString()
        })
        .eq("id", schedule.id);
    }
  } catch {
    // The migration may not have been applied yet. Keep existing TOC actions working.
  }
}
