import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { normaliseSheetSourceConfig, sheetSourceDefaults, toGoogleSheetCsvUrl } from "@/lib/sheet-source-settings";
import { staffInductionsSheet } from "@/lib/toc-data";
import type { InductionFeed, InductionStatus } from "@/lib/toc-data";
import { requireTocScope } from "@/lib/toc-auth";

export const dynamic = "force-dynamic";

const settingsKey = "sheet_source_settings_inductions";

type StaffProfileLink = {
  id: string;
  display_name: string;
  induction_sheet_name: string | null;
};

type RegionRow = {
  id: string;
  name: string;
};

type OperationSiteLink = {
  id: string;
  client_name: string;
  site_name: string;
};

async function readSourceConfig() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return sheetSourceDefaults.inductions;

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", settingsKey)
    .maybeSingle();

  if (error || !data?.value) return sheetSourceDefaults.inductions;
  return normaliseSheetSourceConfig("inductions", data.value as Record<string, unknown>);
}

function scopedEmptyFeed(region: string): InductionFeed {
  return {
    ...staffInductionsSheet,
    sourceName: `${region} induction source required`,
    spreadsheetUrl: "",
    lastRead: "Source required",
    sites: [],
    staff: []
  };
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeStatus(value: string): InductionStatus {
  const trimmed = value.trim();
  if (trimmed === "Inducted") return "Inducted";
  if (trimmed === "Not Inducted") return "Not Inducted";
  if (trimmed === "Expired") return "Expired";
  if (trimmed === "Expiring Soon") return "Expiring Soon";
  if (trimmed === "Expiring This Month") return "Expiring This Month";
  return "";
}

function lowerKey(value: string) {
  return value.trim().toLowerCase();
}

async function cacheInductionFeed(regionName: string, sourceName: string, sites: { name: string; region: string }[], staff: { name: string; inductions: { site: string; status: InductionStatus; expiry: string }[] }[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !staff.length) return;

  const [{ data: regionRows }, { data: profileRows }, { data: siteRows }] = await Promise.all([
    supabase.from("regions").select("id,name").eq("name", regionName).limit(1),
    supabase.from("staff_profiles").select("id,display_name,induction_sheet_name"),
    supabase.from("operation_sites").select("id,client_name,site_name")
  ]);
  const region = ((regionRows || []) as RegionRow[])[0];
  if (!region) return;

  const profiles = new Map<string, string>();
  ((profileRows || []) as StaffProfileLink[]).forEach((profile) => {
    profiles.set(lowerKey(profile.display_name), profile.id);
    if (profile.induction_sheet_name) profiles.set(lowerKey(profile.induction_sheet_name), profile.id);
  });

  const siteMap = new Map<string, string>();
  ((siteRows || []) as OperationSiteLink[]).forEach((site) => {
    siteMap.set(lowerKey(site.site_name), site.id);
    siteMap.set(lowerKey(`${site.client_name} - ${site.site_name}`), site.id);
    siteMap.set(lowerKey(`${site.client_name} ${site.site_name}`), site.id);
  });

  const now = new Date().toISOString();
  const knownSiteNames = new Set(sites.map((site) => site.name));
  const rows = staff.flatMap((person) => person.inductions
    .filter((induction) => knownSiteNames.has(induction.site))
    .map((induction) => ({
      staff_profile_id: profiles.get(lowerKey(person.name)) || null,
      staff_name: person.name,
      site_id: siteMap.get(lowerKey(induction.site)) || null,
      site_name: induction.site,
      region_id: region.id,
      source_slug: "inductions",
      source_name: sourceName,
      status: induction.status || "",
      expiry: induction.expiry || "",
      source_updated_at: now,
      updated_at: now
    })));

  if (rows.length) {
    await supabase
      .from("staff_induction_cache")
      .upsert(rows, { onConflict: "staff_name,site_name,region_id,source_slug" });
  }
}

export async function GET(request: Request) {
  const requestedScope = new URL(request.url).searchParams.get("scope") || "National";
  const scopePermission = await requireTocScope(request, requestedScope);
  if (scopePermission.error) return scopePermission.error;

  const config = await readSourceConfig();

  if (!config.connected || scopePermission.scope !== config.region) {
    return NextResponse.json(scopedEmptyFeed(scopePermission.scope));
  }

  try {
    const response = await fetch(toGoogleSheetCsvUrl(config.spreadsheetUrl, Date.now()), { cache: "no-store" });
    if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status}`);

    const csv = await response.text();
    const rows = parseCsv(csv);
    const siteRow = rows[0] || [];
    const sites = siteRow
      .slice(1)
      .filter((_, index) => index % 2 === 0)
      .map((name) => ({ name: name.trim().replace(/\s+Status$/i, ""), region: "Brisbane" }))
      .filter((site) => site.name);
    const staffRows = rows.slice(1).filter((row) => {
      const staffName = row[0]?.trim() || "";
      return staffName && !/^staff\b/i.test(staffName);
    });
    const staff = staffRows.map((row) => ({
      name: row[0].trim(),
      inductions: sites.map((site, index) => {
        const statusColumn = 1 + index * 2;
        return {
          site: site.name,
          status: normalizeStatus(row[statusColumn] || ""),
          expiry: (row[statusColumn + 1] || "").trim()
        };
      })
    }));
    const feed: InductionFeed = {
      ...staffInductionsSheet,
      sourceName: config.sourceName || staffInductionsSheet.sourceName,
      spreadsheetUrl: config.spreadsheetUrl || staffInductionsSheet.spreadsheetUrl,
      lastRead: new Date().toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" }),
      sites,
      staff
    };

    await cacheInductionFeed(config.region, feed.sourceName, sites, staff);

    return NextResponse.json(feed);
  } catch {
    return NextResponse.json(staffInductionsSheet);
  }
}
