import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnv();

const tocBaseUrl = (process.env.TOC_BASE_URL || "https://thor-operations-command-app.vercel.app").replace(/\/$/, "");
const odinApiKey = process.env.ODIN_API_KEY || "";
const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "log";
const text = String(args.text || args._.slice(1).join(" ") || "").trim();

const regions = ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];

main().catch((error) => {
  console.error(`[toc-command] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (!text && !args.title) throw new Error("Tell me what to log. Example: node toc-command.mjs log \"Critical Melbourne compliance complaint...\"");

  const request = buildRequest(command, args, text);
  console.log(`[toc-command] Destination: ${request.destination}`);
  console.log(`[toc-command] Region: ${request.body.region}`);
  console.log(`[toc-command] Title: ${request.body.title || request.body.text || request.body.item || "TOC command"}`);

  if (args.dryRun || args["dry-run"]) {
    console.log("[toc-command] Dry run only. Nothing written to TOC.");
    console.log(JSON.stringify(request, null, 2));
    return;
  }

  if (!odinApiKey) throw new Error("ODIN_API_KEY is missing. Copy .env.example to .env and set the TOC-side Odin key.");

  const response = await fetch(`${tocBaseUrl}${request.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-odin-api-key": odinApiKey
    },
    body: JSON.stringify(request.body)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.connected === false) {
    throw new Error(result.error || `TOC returned HTTP ${response.status}`);
  }

  console.log("[toc-command] TOC write complete.");
  console.log(JSON.stringify(result, null, 2));
}

function buildRequest(inputCommand, inputArgs, inputText) {
  const destination = normaliseDestination(inputArgs.destination || inputArgs.type || inputCommand, inputText);
  const region = normaliseRegion(inputArgs.region || inputArgs.ownerScope || inferRegion(inputText));
  const severity = normaliseSeverity(inputArgs.severity || inputArgs.priority || inputText);
  const priority = severity === "red" ? "urgent" : severity === "amber" ? "high" : "normal";
  const title = String(inputArgs.title || titleFromText(inputText, destination, region)).trim();
  const detail = String(inputArgs.detail || inputArgs.note || inputArgs.summary || inputText || title).trim();
  const dueAt = inputArgs.dueAt || inputArgs.dueDate || null;

  const base = {
    action: "create",
    region,
    title,
    detail,
    summary: detail,
    recommendedAction: String(inputArgs.recommendedAction || inputArgs.actionRequired || defaultRecommendedAction(destination, region)).trim(),
    severity,
    priority,
    dueAt,
    source: "odin_direct_command",
    dedupeKey: structuredDedupeKey(destination, region, title, dueAt)
  };

  if (destination === "compliance") {
    return {
      destination,
      path: "/api/odin/compliance",
      body: {
        ...base,
        status: "open",
        directiveType: severity === "red" ? "National Ops Directive" : "Scheduled Directive"
      }
    };
  }

  if (destination === "todos") {
    return {
      destination,
      path: "/api/odin/todos",
      body: {
        action: "create",
        itemType: "todo",
        targetRegions: [region],
        region,
        text: title,
        note: detail,
        important: severity !== "blue",
        dueAt,
        source: "odin_direct_command",
        dedupeKey: base.dedupeKey
      }
    };
  }

  if (destination === "equipment") {
    return {
      destination,
      path: "/api/odin/equipment",
      body: {
        ...base,
        assetName: String(inputArgs.assetName || inputArgs.asset || title).trim(),
        assetType: inputArgs.assetType || "Wash asset",
        status: severity === "red" ? "Urgent repair required" : "Service review",
        serviceNote: detail
      }
    };
  }

  if (destination === "stock_orders") {
    return {
      destination,
      path: "/api/odin/stock-orders",
      body: {
        ...base,
        item: String(inputArgs.item || inputArgs.itemName || title).trim(),
        quantity: Number(inputArgs.quantity || 1),
        urgency: severity === "red" ? "urgent" : "normal",
        note: detail
      }
    };
  }

  return {
    destination: "actions",
    path: "/api/odin/actions",
    body: {
      ...base,
      targetRegions: [region],
      sourcePage: "Action Centre",
      directiveType: severity === "red" ? "National Ops Directive" : "To Do"
    }
  };
}

function normaliseDestination(rawDestination, inputText) {
  const value = String(rawDestination || "").toLowerCase().replace(/[-\s]+/g, "_");
  if (["compliance", "equipment", "stock_orders", "todos", "actions"].includes(value)) return value;
  if (["todo", "to_do", "reminder", "remind"].includes(value)) return "todos";
  if (["stock", "stock_order", "ppe", "chemical", "chemicals"].includes(value)) return "stock_orders";
  if (["action", "log"].includes(value)) return inferDestination(inputText);
  return inferDestination(inputText);
}

function inferDestination(inputText) {
  const text = inputText.toLowerCase();
  if (/\b(compliance|complaint|safety|incident|first aid|induction|audit|critical)\b/.test(text)) return "compliance";
  if (/\b(vehicle|unit|trailer|pony|repair|service|servicing|equipment|breakdown)\b/.test(text)) return "equipment";
  if (/\b(stock|chemical|chemicals|ppe|order|supply|supplies|bottle|batteries)\b/.test(text)) return "stock_orders";
  if (/\b(remind|reminder|to do|todo|checklist|pick up|pickup)\b/.test(text)) return "todos";
  return "actions";
}

function inferRegion(inputText) {
  const lower = inputText.toLowerCase();
  return regions.find((region) => lower.includes(region.toLowerCase())) || "National";
}

function normaliseRegion(value) {
  const text = String(value || "").trim();
  return regions.find((region) => region.toLowerCase() === text.toLowerCase()) || text || "National";
}

function normaliseSeverity(value) {
  const text = String(value || "").toLowerCase();
  if (/\b(red|critical|urgent|major|serious|unsafe|safety|complaint)\b/.test(text)) return "red";
  if (/\b(amber|yellow|high|watch|soon|important)\b/.test(text)) return "amber";
  return "blue";
}

function titleFromText(inputText, destination, region) {
  const cleaned = inputText.replace(/\s+/g, " ").trim();
  if (!cleaned) return `${labelForDestination(destination)} - ${region}`;
  const short = cleaned.length > 86 ? `${cleaned.slice(0, 83).trim()}...` : cleaned;
  if (destination === "compliance" && !/compliance|complaint/i.test(short)) return `Compliance issue - ${region}`;
  return short;
}

function defaultRecommendedAction(destination, region) {
  if (destination === "compliance") return `${region} manager to treat this as critical, investigate, correct the compliance issue and close out in TOC.`;
  if (destination === "equipment") return `${region} manager to inspect the asset, update service status and close out in TOC.`;
  if (destination === "stock_orders") return `${region} manager/national team to confirm stock requirement and action the order.`;
  if (destination === "todos") return `${region} manager to complete the reminder and mark it done in TOC.`;
  return `${region} manager to action and close out in TOC.`;
}

function structuredDedupeKey(destination, region, title, dueAt) {
  return [
    "odin-direct-command",
    destination,
    slug(region),
    slug(title).slice(0, 80),
    dueAt ? String(dueAt).slice(0, 10) : "no-due"
  ].join(":");
}

function labelForDestination(destination) {
  return {
    compliance: "Compliance issue",
    equipment: "Equipment issue",
    stock_orders: "Stock order",
    todos: "To Do",
    actions: "Action item"
  }[destination] || "TOC item";
}

function slug(value) {
  return String(value || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
}

function parseArgs(rawArgs) {
  const parsed = { _: [] };
  const booleanFlags = new Set(["dry-run", "dryRun", "help"]);
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split(/=(.*)/s).filter((part) => part !== undefined);
    if (typeof inlineValue === "string") {
      parsed[key] = inlineValue;
      continue;
    }
    if (booleanFlags.has(key)) {
      parsed[key] = true;
      continue;
    }
    const next = rawArgs[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  let content = "";
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && typeof process.env[key] === "undefined") process.env[key] = value;
  }
}
