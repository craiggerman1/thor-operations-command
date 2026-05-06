#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const tocBaseUrl = trimSlash(process.env.TOC_BASE_URL || "https://thor-operations-command-app.vercel.app");
const odinApiKey = process.env.ODIN_API_KEY || "";
const openClawUrl = trimSlash(process.env.OPENCLAW_LOCAL_URL || "http://127.0.0.1:18789");
const openClawToken = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const openClawModel = process.env.OPENCLAW_MODEL || "openclaw/default";
const openClawSessionKey = process.env.OPENCLAW_SESSION_KEY || "toc:watcher";
const dryRun = String(process.env.ODIN_DRY_RUN || "true").toLowerCase() !== "false";
const minimumSeverity = String(process.env.ODIN_MIN_SEVERITY || "amber").toLowerCase();
const duplicateWindowHours = Math.max(1, Number(process.env.ODIN_DUPLICATE_WINDOW_HOURS) || 24);
const snapshotOnly = process.argv.includes("--snapshot-only");

const severityRank = { blue: 1, green: 1, amber: 2, yellow: 2, red: 3 };

main().catch((error) => {
  console.error(`[odin-watcher] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (!odinApiKey) throw new Error("ODIN_API_KEY is missing.");

  console.log("[odin-watcher] Reading TOC snapshot...");
  const snapshot = await getJson(`${tocBaseUrl}/api/odin/snapshot`, {
    "x-odin-api-key": odinApiKey
  });
  printSnapshotSummary(snapshot);

  if (snapshotOnly) {
    console.log("[odin-watcher] Snapshot-only test complete. TOC access is working.");
    return;
  }

  const prompt = buildPrompt(snapshot);
  console.log("[odin-watcher] Asking local Odin/OpenClaw...");
  const analysis = await askLocalOdin(prompt);
  const recommendation = parseRecommendation(analysis);

  if (!recommendation.title) {
    console.log("[odin-watcher] Odin did not return a recommendation title. Nothing to write.");
    return;
  }

  if (!passesSeverity(recommendation.severity, minimumSeverity)) {
    console.log(`[odin-watcher] Recommendation severity ${recommendation.severity} is below ${minimumSeverity}. Nothing written.`);
    return;
  }

  if (isDuplicateRecommendation(snapshot, recommendation)) {
    console.log(`[odin-watcher] Duplicate pending recommendation skipped: ${recommendation.title}`);
    return;
  }

  if (dryRun) {
    console.log("[odin-watcher] Dry run enabled. Recommendation not written to TOC.");
    console.log(JSON.stringify(recommendation, null, 2));
    return;
  }

  const target = writeTarget(recommendation);
  const body = buildWriteBody(recommendation, target.destination);

  console.log(`[odin-watcher] Writing ${target.destination} item to TOC via ${target.path}...`);
  const result = await postJson(`${tocBaseUrl}${target.path}`, {
    "x-odin-api-key": odinApiKey
  }, body);

  console.log(`[odin-watcher] TOC write complete. Connected: ${Boolean(result.connected)}. Action: ${result.action || body.action}. Count: ${result.count || result.createdCount || result.createdTodoIds?.length || result.createdActionIds?.length || result.createdComplianceIds?.length || 0}.`);
}

function buildPrompt(snapshot) {
  return [
    "You are Odin inside Thor Operations Command.",
    "Analyse this TOC operational snapshot as Thor's AI operations manager.",
    "Return one concise JSON object only. No markdown.",
    "Allowed JSON fields: destination, title, summary, region, severity, confidence, noticed, whyItMatters, recommendedAction, dueDate, targetRegions, entityType, entityId, assetName, assetType, stockItem, quantity, urgency.",
    "destination must be one of: action, todo, compliance, equipment, stock_order, note, recommendation.",
    "Route compliance, safety, induction and site readiness risks to destination=compliance.",
    "Route wash vehicle, truck, ute, wash plant, generator, Honda, Pony or service issues to destination=equipment.",
    "Route chemical, PPE, parts, consumable or supply ordering needs to destination=stock_order.",
    "Route quick reminders to destination=todo.",
    "Route manager close-out work to destination=action.",
    "Route history-only observations to destination=note.",
    "Severity must be blue, amber, or red.",
    "Only recommend actions that require operational attention. Do not send external messages.",
    "Focus on the most important operational risk only.",
    "Avoid repeating existing open TOC items already listed in the snapshot.",
    "",
    JSON.stringify(compactSnapshot(snapshot), null, 2)
  ].join("\n");
}

function compactSnapshot(snapshot) {
  const sections = snapshot?.sections || {};
  return {
    generatedAt: snapshot?.generatedAt,
    actionItems: rows(sections.actionItems),
    nationalRequests: rows(sections.nationalRequests),
    stockOrders: rows(sections.stockOrders),
    complianceItems: rows(sections.complianceItems),
    equipmentAssets: rows(sections.equipmentAssets),
    productivitySites: rows(sections.productivitySites),
    todoItems: rows(sections.todoItems),
    pendingOdinItems: rows(sections.odinItems)
  };
}

function rows(section) {
  return Array.isArray(section?.rows) ? section.rows.slice(0, 20) : [];
}

function printSnapshotSummary(snapshot) {
  const sections = snapshot?.sections || {};
  const names = Object.keys(sections);
  console.log(`[odin-watcher] Snapshot connected: ${Boolean(snapshot?.connected)}. Generated: ${snapshot?.generatedAt || "unknown"}.`);
  for (const name of names) {
    const count = Array.isArray(sections[name]?.rows) ? sections[name].rows.length : 0;
    console.log(`[odin-watcher] ${name}: ${count}`);
  }
}

async function askLocalOdin(prompt) {
  if (!openClawToken) throw new Error("OPENCLAW_GATEWAY_TOKEN is missing. Keep it on the AI PC only.");

  const response = await postJson(`${openClawUrl}/v1/chat/completions`, {
    Authorization: `Bearer ${openClawToken}`,
    "x-openclaw-session-key": openClawSessionKey
  }, {
    model: openClawModel,
    messages: [
      {
        role: "system",
        content: "You are Odin inside Thor Operations Command. Be concise, practical, commercially aware, and action-focused. Do not execute external actions unless explicitly approved."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.2
  });

  return response?.choices?.[0]?.message?.content || "";
}

function parseRecommendation(content) {
  const fallback = {
    title: "Odin watcher recommendation",
    summary: String(content || "").slice(0, 600),
    region: "National",
    severity: "amber",
    confidence: 60,
    noticed: "Odin returned a non-JSON response.",
    whyItMatters: "The watcher could not parse the recommendation cleanly.",
    recommendedAction: "Review Odin watcher output and confirm the OpenClaw response format."
  };

  try {
    const jsonText = extractJson(content);
    const parsed = JSON.parse(jsonText);
    return {
      title: safeText(parsed.title, fallback.title).slice(0, 140),
      destination: normaliseDestination(parsed.destination || parsed.itemType || parsed.sourceType || parsed.category),
      summary: safeText(parsed.summary, fallback.summary).slice(0, 700),
      region: safeText(parsed.region, "National"),
      severity: normaliseSeverity(parsed.severity),
      confidence: normaliseConfidence(parsed.confidence),
      noticed: safeText(parsed.noticed, "").slice(0, 700),
      whyItMatters: safeText(parsed.whyItMatters, "").slice(0, 700),
      recommendedAction: safeText(parsed.recommendedAction, "").slice(0, 700),
      dueDate: safeText(parsed.dueDate, ""),
      targetRegions: Array.isArray(parsed.targetRegions) ? parsed.targetRegions.map((region) => String(region)).filter(Boolean) : undefined,
      entityType: safeText(parsed.entityType, ""),
      entityId: safeText(parsed.entityId, ""),
      assetName: safeText(parsed.assetName, ""),
      assetType: safeText(parsed.assetType, ""),
      stockItem: safeText(parsed.stockItem || parsed.item || parsed.itemName, ""),
      quantity: Number.isFinite(Number(parsed.quantity)) ? Math.max(Number(parsed.quantity), 1) : undefined,
      urgency: safeText(parsed.urgency, "")
    };
  } catch {
    return fallback;
  }
}

function normaliseDestination(value) {
  const destination = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (["todo", "to_do", "reminder"].includes(destination)) return "todo";
  if (["compliance", "safety", "induction", "inductions"].includes(destination)) return "compliance";
  if (["equipment", "equipment_servicing", "asset", "vehicle", "service"].includes(destination)) return "equipment";
  if (["stock", "stock_order", "stock_orders", "supply", "supplies", "consumable"].includes(destination)) return "stock_order";
  if (["note", "notes", "memory", "history"].includes(destination)) return "note";
  if (["recommendation", "odin_item"].includes(destination)) return "recommendation";
  return "action";
}

function writeTarget(recommendation) {
  const destination = normaliseDestination(inferDestination(recommendation));
  const paths = {
    action: "/api/odin/actions",
    todo: "/api/odin/todos",
    compliance: "/api/odin/compliance",
    equipment: "/api/odin/equipment",
    stock_order: "/api/odin/stock-orders",
    note: "/api/odin/notes",
    recommendation: "/api/odin/items"
  };

  return { destination, path: paths[destination] || paths.action };
}

function inferDestination(recommendation) {
  if (recommendation.destination) return recommendation.destination;
  const haystack = `${recommendation.title} ${recommendation.summary} ${recommendation.noticed} ${recommendation.recommendedAction}`.toLowerCase();
  if (/\b(induction|compliance|first aid|safety|ppe register|site readiness)\b/.test(haystack)) return "compliance";
  if (/\b(vehicle|truck|ute|unit|u\d+|pony|generator|honda|wash plant|service|repair|odometer|hours)\b/.test(haystack)) return "equipment";
  if (/\b(stock|chemical|chemicals|consumable|consumables|ppe|gloves|bottle|batteries|hose|parts|order)\b/.test(haystack)) return "stock_order";
  if (/\b(remind|reminder|to do|todo|follow up)\b/.test(haystack)) return "todo";
  if (/\b(note|record|history|observed)\b/.test(haystack)) return "note";
  return "action";
}

function buildWriteBody(recommendation, destination) {
  const targetRegions = recommendation.targetRegions?.length ? recommendation.targetRegions : [recommendation.region || "National"];
  const detail = recommendation.recommendedAction || recommendation.summary || recommendation.noticed || "Odin raised this item from TOC watcher analysis.";
  const base = {
    action: "create",
    title: recommendation.title,
    detail,
    summary: recommendation.summary,
    region: recommendation.region || "National",
    targetRegions,
    priority: recommendation.severity === "red" ? "urgent" : recommendation.severity === "amber" ? "high" : "normal",
    severity: recommendation.severity,
    confidence: recommendation.confidence,
    noticed: recommendation.noticed,
    whyItMatters: recommendation.whyItMatters,
    recommendedAction: detail,
    sourceType: "odin_watcher",
    dueDate: recommendation.dueDate || undefined
  };

  if (destination === "todo") return { ...base, itemType: "todo", text: recommendation.title, important: recommendation.severity !== "blue" };
  if (destination === "compliance") return { ...base, status: "open", directiveType: recommendation.severity === "red" ? "National Ops Directive" : "Scheduled Directive" };
  if (destination === "equipment") return {
    ...base,
    assetName: recommendation.assetName || recommendation.entityId || recommendation.title,
    assetType: recommendation.assetType || "Wash asset",
    status: recommendation.severity === "red" ? "Repair / stop use" : "Watch",
    serviceNote: detail
  };
  if (destination === "stock_order") return {
    ...base,
    item: recommendation.stockItem || recommendation.title,
    quantity: recommendation.quantity || 1,
    urgency: recommendation.urgency || (recommendation.severity === "red" ? "urgent" : "normal"),
    note: detail
  };
  if (destination === "note") return {
    ...base,
    entityType: recommendation.entityType || "toc",
    entityId: recommendation.entityId || recommendation.region || "National",
    note: detail,
    facts: {
      noticed: recommendation.noticed,
      whyItMatters: recommendation.whyItMatters,
      watcherSeverity: recommendation.severity
    }
  };
  if (destination === "recommendation") return {
    ...base,
    itemType: "recommendation"
  };

  return {
    ...base,
    itemType: "action",
    sourcePage: "Action Centre",
    directiveType: recommendation.severity === "red" ? "National Ops Directive" : "Scheduled Directive"
  };
}

function extractJson(content) {
  const text = String(content || "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) throw new Error("No JSON object found.");
  return text.slice(first, last + 1);
}

function normaliseSeverity(value) {
  const severity = String(value || "").toLowerCase();
  if (severity === "red") return "red";
  if (severity === "blue") return "blue";
  return "amber";
}

function normaliseConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 70;
  const percentage = numeric <= 1 ? numeric * 100 : numeric;
  return Math.round(Math.max(0, Math.min(percentage, 100)));
}

function safeText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function passesSeverity(severity, minimum) {
  return (severityRank[severity] || 0) >= (severityRank[minimum] || 0);
}

function isDuplicateRecommendation(snapshot, recommendation) {
  const existingItems = [
    ...rows(snapshot?.sections?.odinItems),
    ...rows(snapshot?.sections?.actionItems),
    ...rows(snapshot?.sections?.complianceItems),
    ...rows(snapshot?.sections?.equipmentAssets),
    ...rows(snapshot?.sections?.stockOrders),
    ...rows(snapshot?.sections?.todoItems)
  ];
  const title = normaliseTitle(recommendation.title);
  const cutoff = Date.now() - duplicateWindowHours * 60 * 60 * 1000;

  return existingItems.some((item) => {
    const itemTitle = normaliseTitle(item.title || item.asset_name || item.assetName || item.item?.item_name || item.item || "");
    const itemTime = Date.parse(item.created_at || item.createdAt || "");
    const insideWindow = Number.isFinite(itemTime) ? itemTime >= cutoff : true;
    return insideWindow && itemTitle === title;
  });
}

function normaliseTitle(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

function trimSlash(value) {
  return String(value || "").replace(/\/$/, "");
}
