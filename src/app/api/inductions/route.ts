import { NextResponse } from "next/server";
import { staffInductionsSheet } from "@/lib/toc-data";
import type { InductionFeed, InductionStatus } from "@/lib/toc-data";

export const dynamic = "force-dynamic";

const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/1MFFxCPAhPzTzB9Q7zPOBLJyNyz04S23NoJ1GZ6-VRlM/gviz/tq?tqx=out:csv&gid=0";

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

export async function GET() {
  try {
    const response = await fetch(sheetCsvUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status}`);

    const csv = await response.text();
    const rows = parseCsv(csv);
    const siteRow = rows[0] || [];
    const sites = siteRow
      .slice(1)
      .filter((_, index) => index % 2 === 0)
      .map((name) => ({ name: name.trim(), region: "Brisbane" }))
      .filter((site) => site.name);
    const staffRows = rows.slice(2).filter((row) => row[0]?.trim());
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
      lastRead: new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" }),
      sites,
      staff
    };

    return NextResponse.json(feed);
  } catch {
    return NextResponse.json(staffInductionsSheet);
  }
}
