import { NextResponse } from "next/server";

export const runtime = "nodejs";

const headers = [
  "Region",
  "Client Name",
  "Site Name",
  "Site Address",
  "Job Day",
  "Start Date",
  "End Date",
  "Start Time",
  "End Time",
  "Frequency",
  "A Week",
  "B Week",
  "C Week",
  "D Week",
  "Staff Required",
  "Rostered Staff",
  "Wash Asset",
  "Job Title",
  "Notes",
  "Active"
];

const exampleRows = [
  [
    "Brisbane",
    "Linfox",
    "Larapinta Depot",
    "55 Example Rd, Larapinta QLD",
    "Thursday",
    "2026-05-14",
    "",
    "18:00",
    "22:00",
    "Weekly",
    "",
    "Yes",
    "",
    "Yes",
    "3",
    "Craig German; Simon Smith; John Worker",
    "Pony 1",
    "Trailer wash program",
    "Requires induction. End time is stored in notes for now.",
    "Yes"
  ],
  [
    "Sydney",
    "Woolworths",
    "Minchinbury",
    "",
    "Friday",
    "",
    "",
    "20:00",
    "23:00",
    "Fortnightly",
    "Yes",
    "",
    "Yes",
    "",
    "2",
    "Jane Worker; Team Leader Name",
    "U12",
    "Night wash bay",
    "Start Date can be blank if Job Day is supplied.",
    "Yes"
  ]
];

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET() {
  const csv = [headers, ...exampleRows].map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="TOC Roster Import Template.csv"',
      "Cache-Control": "no-store"
    }
  });
}
