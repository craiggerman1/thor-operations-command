import { getSupabaseAdminClient } from "@/lib/supabase";

export type OdinOperationalContext = {
  owner: string;
  ownerRegion: string;
  visibility: string[];
  escalationPath: string[];
  escalationLevel: "none" | "watch" | "national" | "craig";
  interruptCraig: boolean;
  entity: {
    type: string;
    id: string | null;
    label: string | null;
    client: string | null;
    site: string | null;
    staff: string | null;
    vehicle: string | null;
    job: string | null;
  };
  issueType: string;
  category: string;
  dedupeKey: string;
};

function slug(value: unknown, fallback = "none") {
  const cleaned = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || fallback;
}

export function odinDedupeKey(parts: Array<unknown>) {
  return parts.map((part) => slug(part)).join(":");
}

function field(payload: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function inferEntity(payload: Record<string, unknown>, title: string) {
  const vehicle = field(payload, ["vehicle", "vehicleId", "unit", "unitId", "fleetNumber", "assetName", "asset"]);
  const site = field(payload, ["site", "siteName", "locationSite"]);
  const client = field(payload, ["client", "clientName", "customer", "customerName"]);
  const staff = field(payload, ["staff", "staffMember", "employee", "employeeName"]);
  const job = field(payload, ["job", "jobId", "jobTitle"]);
  const explicitType = field(payload, ["entityType", "sourceType"]);
  const explicitId = field(payload, ["entityId", "sourceId"]);

  const type = explicitType || (vehicle ? "vehicle" : site ? "site" : staff ? "staff" : job ? "job" : client ? "client" : "toc_item");
  const id = explicitId || vehicle || site || staff || job || client || null;

  return {
    type,
    id,
    label: field(payload, ["entityLabel", "label", "name"]) || id || title || null,
    client,
    site,
    staff,
    vehicle,
    job
  };
}

function ownerForRegion(region: string) {
  if (region === "National") return "National Manager";
  if (region === "Workshop") return "Workshop Manager";
  return `${region} Manager`;
}

function issueTypeFor(input: {
  payload: Record<string, unknown>;
  title: string;
  sourcePage: string;
  category: string;
}) {
  return slug(
    field(input.payload, ["issueType", "issue", "riskType"]) ||
    input.category ||
    input.sourcePage ||
    input.title,
    "operational-issue"
  );
}

function categoryFor(payload: Record<string, unknown>, sourcePage: string) {
  return slug(field(payload, ["category", "type", "destination"]) || sourcePage || "operations", "operations");
}

function escalation(input: {
  region: string;
  severity: string;
  priority?: string | null;
  category: string;
  dueAt?: string | null;
  urgent?: boolean;
}) {
  const severity = input.severity.toLowerCase();
  const priority = String(input.priority || "").toLowerCase();
  const category = input.category.toLowerCase();
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const overdue = dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt < new Date() : false;
  const safetyCritical = category.includes("safety") || category.includes("compliance") || category.includes("client");
  const red = severity === "red" || priority === "urgent" || input.urgent === true;

  if (red && safetyCritical) {
    return {
      escalationLevel: "craig" as const,
      interruptCraig: true,
      escalationPath: [ownerForRegion(input.region), "National Manager", "Craig"]
    };
  }

  if (red || overdue) {
    return {
      escalationLevel: "national" as const,
      interruptCraig: false,
      escalationPath: [ownerForRegion(input.region), "National Manager"]
    };
  }

  if (severity === "amber") {
    return {
      escalationLevel: "watch" as const,
      interruptCraig: false,
      escalationPath: [ownerForRegion(input.region)]
    };
  }

  return {
    escalationLevel: "none" as const,
    interruptCraig: false,
    escalationPath: [ownerForRegion(input.region)]
  };
}

export function buildOdinOperationalContext(input: {
  payload?: Record<string, unknown>;
  destination: string;
  region: string;
  title: string;
  sourcePage?: string;
  severity?: string;
  priority?: string | null;
  dueAt?: string | null;
}) {
  const payload = input.payload || {};
  const sourcePage = input.sourcePage || String(payload.sourcePage || input.destination || "operations");
  const category = categoryFor(payload, sourcePage);
  const entity = inferEntity(payload, input.title);
  const issueType = issueTypeFor({ payload, title: input.title, sourcePage, category });
  const explicitDedupeKey = field(payload, ["dedupeKey", "dedupe_key"]);
  const escalationResult = escalation({
    region: input.region,
    severity: input.severity || String(payload.severity || "amber"),
    priority: input.priority || String(payload.priority || ""),
    category,
    dueAt: input.dueAt,
    urgent: payload.urgent === true
  });

  return {
    owner: ownerForRegion(input.region),
    ownerRegion: input.region,
    visibility: Array.from(new Set([input.region, "National"])),
    entity,
    issueType,
    category,
    dedupeKey: explicitDedupeKey || odinDedupeKey([input.region, entity.type, entity.id || entity.label || input.title, issueType, input.dueAt || "no-due-date"]),
    ...escalationResult
  };
}

export async function saveOdinOperationalMemory(input: {
  context: OdinOperationalContext;
  sourceType: string;
  sourceId: string;
  region: string;
  title: string;
  summary: string;
  lastResponse?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const sessionKey = `toc:${slug(input.sourceType)}:${slug(input.sourceId)}`;
  await supabase.from("odin_memory").upsert({
    session_key: sessionKey,
    source_type: input.sourceType,
    source_id: input.sourceId,
    region: input.region,
    title: input.title,
    summary: input.summary,
    facts: input.context,
    last_response: input.lastResponse || {},
    updated_at: new Date().toISOString()
  }, { onConflict: "session_key" });
}
