import { NextResponse } from "next/server";
import { staffAvailabilitySheet } from "@/lib/toc-data";
import type { StaffAvailabilityFeed, StaffSheetStatus } from "@/lib/toc-data";

export const dynamic = "force-dynamic";

const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/1dFwTlBmOUPeq21LQdv6AzHFztuLDRC-j7io-B_1zWx0/gviz/tq?tqx=out:csv&gid=0";

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

function normalizeStatus(value: string): StaffSheetStatus {
  const trimmed = value.trim();
  if (trimmed === "Available") return "Available";
  if (trimmed === "Not Available") return "Not Available";
  return "";
}

export async function GET() {
  try {
    const response = await fetch(sheetCsvUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status}`);

    const csv = await response.text();
    const rows = parseCsv(csv);
    const staffRows = rows.slice(2).filter((row) => row[0]?.trim());
    const staff = staffRows.map((row) => ({
      name: row[0].trim(),
      availability: staffAvailabilitySheet.days.map((_, dayIndex) => {
        const startColumn = 1 + dayIndex * staffAvailabilitySheet.windows.length;
        return staffAvailabilitySheet.windows.map((_, windowIndex) => normalizeStatus(row[startColumn + windowIndex] || ""));
      })
    }));

    const feed: StaffAvailabilityFeed = {
      ...staffAvailabilitySheet,
      lastRead: new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" }),
      staff
    };

    return NextResponse.json(feed);
  } catch {
    return NextResponse.json(staffAvailabilitySheet);
  }
}
