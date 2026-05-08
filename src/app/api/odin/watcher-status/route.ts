import { NextResponse } from "next/server";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { getSupabaseAdminClient } from "@/lib/supabase";

const expectedWatcherVersion = "0.312";
const watcherSessionKey = "toc:odin-watcher:status";

function ageMinutes(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const { data: heartbeat, error: heartbeatError } = await supabase
    .from("odin_memory")
    .select("id,session_key,summary,facts,last_response,updated_at")
    .eq("session_key", watcherSessionKey)
    .maybeSingle();

  const { data: latestBrief } = await supabase
    .from("odin_daily_briefs")
    .select("id,brief_date,brief_type,title,severity,source,updated_at")
    .eq("source", "odin_watcher")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (heartbeatError) return NextResponse.json({ connected: false, error: heartbeatError.message }, { status: 500 });

  const facts = heartbeat?.facts && typeof heartbeat.facts === "object" ? heartbeat.facts as Record<string, unknown> : {};
  const version = String(facts.watcherVersion || "");
  const lastSeenMinutes = ageMinutes(heartbeat?.updated_at);
  const isCurrent = version === expectedWatcherVersion;
  const dryRun = facts.dryRun === true;
  const stale = lastSeenMinutes === null || lastSeenMinutes > 90;
  const status = !heartbeat
    ? "not_seen"
    : stale
      ? "stale"
      : !isCurrent
        ? "version_mismatch"
        : dryRun
          ? "dry_run"
          : "healthy";

  return NextResponse.json({
    connected: true,
    expectedWatcherVersion,
    watcherSessionKey,
    status,
    healthy: status === "healthy",
    lastSeenAt: heartbeat?.updated_at || null,
    lastSeenMinutes,
    summary: heartbeat?.summary || "No Odin watcher heartbeat has been recorded yet.",
    facts,
    latestBrief: latestBrief || null,
    checks: {
      heartbeatSeen: Boolean(heartbeat),
      versionCurrent: isCurrent,
      dryRunDisabled: !dryRun,
      freshWithin90Minutes: !stale
    }
  });
}
