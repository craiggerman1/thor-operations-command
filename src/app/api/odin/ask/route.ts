import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { blockOdinWriteIfOverwatchPaused } from "@/lib/odin-control";
import { isOdinExternal, requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { normaliseOdinSeverity } from "@/lib/odin";
import { getSupabaseAdminClient } from "@/lib/supabase";

type OdinStructuredResponse = {
  summary: string;
  risk: string;
  recommendation: string;
  draftMessage: string;
  requiresApproval: boolean;
  confidence: number;
};

type OdinAskPayload = {
  sourceType?: string;
  sourceId?: string;
  region?: string;
  title?: string;
  prompt?: string;
  context?: Record<string, unknown>;
};

const odinSystemInstruction = "You are Odin inside Thor Operations Command. Analyse the supplied TOC context as Thor's AI operations manager. Be concise, practical, commercially aware, and action-focused. Identify risks, missing information, recommended next steps, and draft messages where useful. Do not execute external actions unless explicitly approved.";

const contextTables: Record<string, { table: string; select: string }> = {
  action_item: { table: "action_items", select: "*,region:regions(name)" },
  productivity_site: { table: "productivity_sites", select: "*,region:regions(name)" },
  national_request: { table: "national_requests", select: "*,region:regions(name)" },
  stock_order: { table: "stock_orders", select: "*" },
  compliance_item: { table: "compliance_items", select: "*,region:regions(name)" },
  equipment_asset: { table: "equipment_assets", select: "*,region:regions(name)" },
  calendar_job: { table: "calendar_jobs", select: "*,region:regions(name)" },
  todo_item: { table: "todo_items", select: "*" }
};
const activeActionStatuses = ["open", "acknowledged", "in_progress", "blocked", "submitted_for_review", "returned_to_manager", "reopened", "escalated"];

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampConfidence(value: unknown) {
  const confidence = Math.round(Number(value));
  if (!Number.isFinite(confidence)) return 65;
  return Math.max(0, Math.min(confidence, 100));
}

function normaliseStructuredResponse(value: unknown, fallbackTitle: string): OdinStructuredResponse {
  const candidate = typeof value === "object" && value ? value as Record<string, unknown> : {};
  return {
    summary: cleanText(candidate.summary, `${fallbackTitle} has been logged for Odin review.`),
    risk: cleanText(candidate.risk, "Odin has not identified a specific risk yet."),
    recommendation: cleanText(candidate.recommendation, "Review the TOC record and decide whether a manager follow-up is required."),
    draftMessage: cleanText(candidate.draftMessage),
    requiresApproval: candidate.requiresApproval !== false,
    confidence: clampConfidence(candidate.confidence)
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractGatewayContent(payload: unknown) {
  const candidate = typeof payload === "object" && payload ? payload as Record<string, unknown> : {};
  const choices = Array.isArray(candidate.choices) ? candidate.choices : [];
  const firstChoice = typeof choices[0] === "object" && choices[0] ? choices[0] as Record<string, unknown> : {};
  const message = typeof firstChoice.message === "object" && firstChoice.message ? firstChoice.message as Record<string, unknown> : {};
  const content = message.content;
  return typeof content === "string" ? content : "";
}

function buildSessionKey(sourceType: string, sourceId: string | null, region: string) {
  const identity = sourceId || region || "general";
  return `toc:${sourceType}:${identity}`.replace(/\s+/g, "-").toLowerCase();
}

async function countTable(table: string, filters: Record<string, unknown> = {}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return 0;

  let query = supabase.from(table).select("id", { count: "exact", head: true });
  Object.entries(filters).forEach(([key, value]) => {
    query = Array.isArray(value) ? query.in(key, value) : query.eq(key, value);
  });

  const { count } = await query;
  return count || 0;
}

async function readSourceRecord(sourceType: string, sourceId: string | null) {
  const source = contextTables[sourceType];
  const supabase = getSupabaseAdminClient();
  if (!supabase || !source || !sourceId) return null;

  const { data, error } = await supabase
    .from(source.table)
    .select(source.select)
    .eq("id", sourceId)
    .maybeSingle();

  if (error) return { error: error.message };
  return data || null;
}

async function buildTocContext(payload: {
  sourceType: string;
  sourceId: string | null;
  region: string;
  title: string;
  prompt: string;
  context: Record<string, unknown>;
}) {
  const [sourceRecord, openActions, pendingNationalRequests, pendingOdinItems, openStockOrders, complianceItems, equipmentWatch] = await Promise.all([
    readSourceRecord(payload.sourceType, payload.sourceId),
    countTable("action_items", { status: activeActionStatuses }),
    countTable("national_requests", { status: "awaiting_review" }),
    countTable("odin_items", { status: "pending" }),
    countTable("stock_orders", { status: "submitted" }),
    countTable("compliance_items", { status: "open" }),
    countTable("equipment_assets", { status: "watch" })
  ]);

  return {
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    title: payload.title,
    region: payload.region,
    userContext: payload.context,
    sourceRecord,
    counts: {
      openActions,
      pendingNationalRequests,
      pendingOdinItems,
      openStockOrders,
      complianceItems,
      equipmentWatch
    },
    generatedAt: new Date().toISOString()
  };
}

async function callOdinGateway(input: { sessionKey: string; prompt: string; tocContext: Record<string, unknown>; memory: Record<string, unknown> | null }) {
  const gatewayUrl = (process.env.OPENCLAW_GATEWAY_URL || process.env.ODIN_GATEWAY_URL || "").replace(/\/$/, "");
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.ODIN_GATEWAY_TOKEN || "";
  const model = process.env.OPENCLAW_MODEL || process.env.ODIN_GATEWAY_MODEL || "openclaw/default";

  const gatewayRequest = {
    model,
    messages: [
      { role: "system", content: odinSystemInstruction },
      { role: "user", content: JSON.stringify(input) }
    ],
    response_format: { type: "json_object" }
  };

  if (!gatewayUrl || !gatewayToken) {
    return {
      connected: false,
      gatewayRequest: { ...gatewayRequest, messages: "[redacted until gateway is configured]" },
      gatewayResponse: { configured: false },
      structured: normaliseStructuredResponse({
        summary: "Odin gateway is ready in TOC, but the OpenClaw gateway environment variables are not configured yet.",
        risk: "Odin cannot provide live AI analysis until the gateway URL and token are added to Vercel.",
        recommendation: "Set OPENCLAW_GATEWAY_URL and OPENCLAW_GATEWAY_TOKEN in Vercel, then redeploy. This request has still been logged with persistent memory.",
        draftMessage: "",
        requiresApproval: true,
        confidence: 40
      }, "Odin gateway not configured")
    };
  }

  let response: Response;
  try {
    response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gatewayToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(gatewayRequest),
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    return {
      connected: false,
      gatewayRequest: { ...gatewayRequest, messages: "[redacted]" },
      gatewayResponse: { error: error instanceof Error ? error.message : "Gateway request failed." },
      structured: normaliseStructuredResponse({
        summary: "Odin gateway could not be reached.",
        risk: "TOC could not connect to the OpenClaw gateway for this request.",
        recommendation: "Check that the Odin/OpenClaw PC gateway is online, reachable from Vercel, and using the correct token.",
        requiresApproval: true,
        confidence: 25
      }, "Odin gateway unavailable")
    };
  }
  const gatewayResponse = await response.json().catch(() => ({ error: "Gateway returned non-JSON response." })) as Record<string, unknown>;
  if (!response.ok) {
    return {
      connected: false,
      gatewayRequest: { ...gatewayRequest, messages: "[redacted]" },
      gatewayResponse,
      structured: normaliseStructuredResponse({
        summary: "Odin gateway call failed.",
        risk: cleanText(gatewayResponse.error, "The AI gateway did not return a successful response."),
        recommendation: "Check the OpenClaw gateway URL, token and model configuration before relying on Odin live analysis.",
        requiresApproval: true,
        confidence: 30
      }, "Odin gateway failure")
    };
  }

  const content = extractGatewayContent(gatewayResponse);
  const parsedContent = content ? safeJsonParse(content) : gatewayResponse;
  return {
    connected: true,
    gatewayRequest: { ...gatewayRequest, messages: "[redacted]" },
    gatewayResponse,
    structured: normaliseStructuredResponse(parsedContent, "Odin recommendation")
  };
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;
  const paused = await blockOdinWriteIfOverwatchPaused(permission);
  if (paused) return paused;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ connected: false, error: "Supabase server key is not configured." }, { status: 503 });

  const body = await request.json() as OdinAskPayload;
  const sourceType = cleanText(body.sourceType, "toc");
  const sourceId = body.sourceId ? String(body.sourceId) : null;
  const region = cleanText(body.region, "National");
  const title = cleanText(body.title, "Odin TOC review");
  const prompt = cleanText(body.prompt, `Review ${title} and recommend the safest next operational action.`);
  const context = typeof body.context === "object" && body.context ? body.context : {};
  const sessionKey = buildSessionKey(sourceType, sourceId, region);

  const { data: existingMemory } = await supabase
    .from("odin_memory")
    .select("session_key,summary,facts,last_response,updated_at")
    .eq("session_key", sessionKey)
    .maybeSingle();

  const tocContext = await buildTocContext({ sourceType, sourceId, region, title, prompt, context });
  const gatewayResult = await callOdinGateway({
    sessionKey,
    prompt,
    tocContext,
    memory: existingMemory as Record<string, unknown> | null
  });
  const structured = gatewayResult.structured;

  const itemPayload = {
    item_type: "recommendation",
    title: `Odin: ${title}`,
    summary: structured.summary,
    region,
    source_type: sourceType,
    source_id: sourceId,
    severity: normaliseOdinSeverity(structured.confidence < 45 ? "amber" : "blue"),
    confidence: structured.confidence,
    approval_required: true,
    status: "pending",
    noticed: structured.risk,
    why_it_matters: structured.risk,
    recommended_action: structured.recommendation,
    assigned_to: "National",
    created_by: isOdinExternal(permission) ? "odin" : permission.user?.id || "toc_user",
    payload: {
      draftMessage: structured.draftMessage,
      requiresApproval: structured.requiresApproval,
      sessionKey,
      gatewayConnected: gatewayResult.connected
    }
  };

  const { data: item, error: itemError } = await supabase
    .from("odin_items")
    .insert(itemPayload)
    .select("id")
    .single();

  if (itemError) return NextResponse.json({ connected: false, error: itemError.message }, { status: 500 });

  await supabase.from("odin_memory").upsert({
    session_key: sessionKey,
    source_type: sourceType,
    source_id: sourceId,
    region,
    title,
    summary: structured.summary,
    facts: {
      lastPrompt: prompt,
      lastContextCounts: tocContext.counts,
      sourceRecordKnown: Boolean(tocContext.sourceRecord)
    },
    last_response: structured,
    updated_at: new Date().toISOString()
  }, { onConflict: "session_key" });

  await supabase.from("odin_interactions").insert({
    session_key: sessionKey,
    source_type: sourceType,
    source_id: sourceId,
    region,
    requested_by: permission.kind === "toc" && permission.user.id !== "development-admin" ? permission.user.id : null,
    actor_type: permission.kind,
    prompt,
    context_payload: tocContext,
    gateway_request: gatewayResult.gatewayRequest,
    gateway_response: gatewayResult.gatewayResponse,
    structured_response: structured,
    odin_item_id: item.id
  });

  await supabase.from("odin_activity_log").insert({
    odin_item_id: item.id,
    actor_profile_id: permission.kind === "toc" && permission.user.id !== "development-admin" ? permission.user.id : null,
    actor_type: permission.kind,
    action: "odin.ask",
    note: title,
    payload: { sessionKey, sourceType, sourceId, gatewayConnected: gatewayResult.connected }
  });

  await logTocAudit({
    actor: permission.kind === "toc" ? permission.user : undefined,
    action: "odin.ask",
    entityTable: "odin_items",
    entityId: item.id,
    scope: region,
    details: { title, sourceType, sourceId, sessionKey, gatewayConnected: gatewayResult.connected }
  });

  return NextResponse.json({
    connected: true,
    gatewayConnected: gatewayResult.connected,
    sessionKey,
    response: structured,
    item: { id: item.id, ...itemPayload }
  });
}
