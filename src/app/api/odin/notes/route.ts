import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { odinIdsFromPayload, odinOperation } from "@/lib/odin-api-utils";
import { blockOdinWriteIfOverwatchPaused } from "@/lib/odin-control";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { getSupabaseAdminClient } from "@/lib/supabase";

function sessionKeyFor(payload: Record<string, unknown>) {
  const entityType = String(payload.entityType || payload.sourceType || "toc").trim().toLowerCase().replace(/\s+/g, "-");
  const entityId = String(payload.entityId || payload.sourceId || payload.region || "general").trim().toLowerCase().replace(/\s+/g, "-");
  return String(payload.sessionKey || `toc:${entityType}:${entityId}`);
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;
  const paused = await blockOdinWriteIfOverwatchPaused(permission);
  if (paused) return paused;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const payload = await request.json().catch(() => ({}));

  try {
    const action = odinOperation(payload.action, ["create", "update", "delete"]);
    const actor = permission.kind === "toc" ? permission.user : undefined;

    if (action === "delete") {
      const ids = odinIdsFromPayload(payload, ["noteIds", "memoryIds"]);
      if (!ids.length) throw new Error("Note id or ids are required for delete.");
      const { data, error } = await supabase.from("odin_memory").delete().in("id", ids).select("id");
      if (error) throw error;
      const deletedNoteIds = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
      await logTocAudit({ actor, action: "odin.note.delete", entityTable: "odin_memory", entityId: deletedNoteIds[0], details: { requestedIds: ids, deletedNoteIds, actorType: permission.kind } });
      return NextResponse.json({ connected: true, action: "delete", deletedNoteIds, count: deletedNoteIds.length });
    }

    const title = String(payload.title || payload.noteTitle || "Odin operational note").trim();
    const summary = String(payload.summary || payload.note || payload.detail || "").trim();
    if (!summary && action === "create") throw new Error("Note summary is required.");

    const sourceType = String(payload.entityType || payload.sourceType || "toc");
    const sourceId = payload.entityId || payload.sourceId ? String(payload.entityId || payload.sourceId) : null;
    const region = String(payload.region || "National");
    const session_key = sessionKeyFor(payload);
    const facts = typeof payload.facts === "object" && payload.facts ? payload.facts : {};
    const last_response = typeof payload.lastResponse === "object" && payload.lastResponse ? payload.lastResponse : {};

    const notePayload: Record<string, unknown> = {
      session_key,
      source_type: sourceType,
      source_id: sourceId,
      region,
      title,
      updated_at: new Date().toISOString()
    };
    if (summary) notePayload.summary = summary;
    if (Object.keys(facts as Record<string, unknown>).length) notePayload.facts = facts;
    if (Object.keys(last_response as Record<string, unknown>).length) notePayload.last_response = last_response;

    const { data, error } = await supabase
      .from("odin_memory")
      .upsert(notePayload, { onConflict: "session_key" })
      .select("id,session_key")
      .single();

    if (error) throw error;

    await supabase.from("odin_interactions").insert({
      session_key,
      source_type: sourceType,
      source_id: sourceId,
      region,
      requested_by: permission.kind === "toc" && permission.user.id !== "development-admin" ? permission.user.id : null,
      actor_type: permission.kind,
      prompt: String(payload.prompt || "Odin operational note"),
      context_payload: { note: summary, facts },
      gateway_request: {},
      gateway_response: {},
      structured_response: { summary },
      odin_item_id: null
    });

    await logTocAudit({ actor, action: action === "update" ? "odin.note.update" : "odin.note.create", entityTable: "odin_memory", entityId: data.id, scope: region, details: { sessionKey: data.session_key, sourceType, sourceId, actorType: permission.kind } });
    return NextResponse.json({ connected: true, action, noteId: data.id, sessionKey: data.session_key, count: 1 });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Odin note request could not be completed." }, { status: 400 });
  }
}
