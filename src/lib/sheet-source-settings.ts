export type SheetSourceSlug = "staff-availability" | "inductions";

export type SheetSourceConfig = {
  slug: SheetSourceSlug;
  sourceName: string;
  spreadsheetUrl: string;
  region: string;
  statusLabel: string;
  connected: boolean;
};

export const sheetSourceDefaults: Record<SheetSourceSlug, SheetSourceConfig> = {
  "staff-availability": {
    slug: "staff-availability",
    sourceName: "Brisbane Staff Availability",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1VVMJDzjAm6HrR1SLYIBg0sDcPX9ec14h/edit?usp=sharing&ouid=101366717795368889476&rtpof=true&sd=true",
    region: "Brisbane",
    statusLabel: "Controlled source",
    connected: true
  },
  inductions: {
    slug: "inductions",
    sourceName: "Brisbane Staff Inductions",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1m04wK7aY5UhnMvWvTTCjYUAozoPNlhH1/edit?usp=sharing&ouid=101366717795368889476&rtpof=true&sd=true",
    region: "Brisbane",
    statusLabel: "Controlled source",
    connected: true
  }
};

export function isSheetSourceSlug(value: string): value is SheetSourceSlug {
  return value === "staff-availability" || value === "inductions";
}

export function normaliseSheetSourceConfig(slug: SheetSourceSlug, value: Partial<SheetSourceConfig> | null | undefined): SheetSourceConfig {
  const fallback = sheetSourceDefaults[slug];

  return {
    slug,
    sourceName: typeof value?.sourceName === "string" && value.sourceName.trim() ? value.sourceName.trim() : fallback.sourceName,
    spreadsheetUrl: typeof value?.spreadsheetUrl === "string" && value.spreadsheetUrl.trim() ? value.spreadsheetUrl.trim() : fallback.spreadsheetUrl,
    region: typeof value?.region === "string" && value.region.trim() ? value.region.trim() : fallback.region,
    statusLabel: typeof value?.statusLabel === "string" && value.statusLabel.trim() ? value.statusLabel.trim() : fallback.statusLabel,
    connected: typeof value?.connected === "boolean" ? value.connected : fallback.connected
  };
}

export function toGoogleSheetCsvUrl(spreadsheetUrl: string, cacheBust?: string | number) {
  const spreadsheetId = spreadsheetUrl.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
  if (!spreadsheetId) return spreadsheetUrl;

  const gidMatch = spreadsheetUrl.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch?.[1] || "0";
  const cacheSuffix = cacheBust ? `&tocBust=${encodeURIComponent(String(cacheBust))}` : "";
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}${cacheSuffix}`;
}
