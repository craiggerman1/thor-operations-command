#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
const live = process.argv.includes("--live");
const briefDate = brisbaneDate();
const seed = Date.now().toString(36);

const payload = {
  action: "upsert",
  briefType: "midday",
  briefDate,
  region: "National",
  title: `Odin mixed routing test - ${briefDate}`,
  summary: "Controlled Odin routing test. Confirms mixed priority items route to the correct TOC destinations.",
  severity: "amber",
  status: "current",
  source: "odin_routing_test",
  autoCreateActions: true,
  priorityItems: [
    {
      title: `Routing test compliance ${seed}`,
      region: "Brisbane",
      severity: "red",
      destination: "compliance",
      recommendedAction: "Confirm compliance issue routes to Compliance and creates linked Action Centre close-out.",
      entityType: "site",
      entityId: `routing-test-compliance-${seed}`,
      dedupeKey: `routing-test:${briefDate}:compliance:${seed}`
    },
    {
      title: `Routing test equipment ${seed}`,
      region: "Workshop",
      severity: "amber",
      destination: "equipment",
      recommendedAction: "Confirm equipment issue routes to Equipment Servicing with linked service action.",
      assetName: `Routing Test Pony ${seed}`,
      assetType: "Pony",
      entityType: "equipment",
      entityId: `routing-test-equipment-${seed}`,
      dedupeKey: `routing-test:${briefDate}:equipment:${seed}`
    },
    {
      title: `Routing test stock ${seed}`,
      region: "Brisbane",
      severity: "amber",
      destination: "stock_orders",
      recommendedAction: "Confirm stock issue attempts Stock Orders routing using approved catalogue matching.",
      item: "Heavy duty wash chemical",
      quantity: 1,
      urgency: "normal",
      entityType: "stock_item",
      entityId: `routing-test-stock-${seed}`,
      dedupeKey: `routing-test:${briefDate}:stock:${seed}`
    },
    {
      title: `Routing test todo ${seed}`,
      region: "Brisbane",
      severity: "amber",
      destination: "todos",
      recommendedAction: "Confirm manager reminder routes to To Do.",
      entityType: "todo",
      entityId: `routing-test-todo-${seed}`,
      dedupeKey: `routing-test:${briefDate}:todo:${seed}`
    },
    {
      title: `Routing test action ${seed}`,
      region: "Sydney",
      severity: "amber",
      destination: "actions",
      recommendedAction: "Confirm operational action routes directly to Action Centre.",
      entityType: "action",
      entityId: `routing-test-action-${seed}`,
      dedupeKey: `routing-test:${briefDate}:action:${seed}`
    }
  ]
};

if (!live) {
  console.log("[odin-routing-test] Dry output only. Add --live to write this seeded brief to TOC.");
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (!odinApiKey) {
  console.error("[odin-routing-test] ODIN_API_KEY is missing.");
  process.exit(1);
}

const response = await fetch(`${tocBaseUrl}/api/odin/briefs`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-odin-api-key": odinApiKey
  },
  body: JSON.stringify(payload)
});

const result = await response.json().catch(() => ({}));
if (!response.ok || result.connected === false) {
  console.error(`[odin-routing-test] Request failed: ${response.status}`);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log("[odin-routing-test] Mixed routing brief written.");
console.log(JSON.stringify({
  brief: result.brief,
  followThrough: result.followThrough,
  followThroughError: result.followThroughError || null
}, null, 2));

function brisbaneDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).reduce((output, part) => {
    output[part.type] = part.value;
    return output;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function trimSlash(value) {
  return String(value || "").replace(/\/$/, "");
}
