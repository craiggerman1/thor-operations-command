import { NextResponse } from "next/server";
import { logTocAudit } from "@/lib/audit";
import { blockOdinWriteIfOverwatchPaused } from "@/lib/odin-control";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { isSheetSourceSlug, type SheetSourceSlug } from "@/lib/sheet-source-settings";
import { syncAvailabilitySheetToDatabase, syncInductionSheetToDatabase } from "@/lib/sheet-feed-sync";

export const dynamic = "force-dynamic";

type SyncResult = {
  slug: SheetSourceSlug;
  connected: boolean;
  region: string;
  sourceName: string;
  cachedRows: number;
  staffCount?: number;
  siteCount?: number;
  error?: string;
};

async function syncOne(slug: SheetSourceSlug): Promise<SyncResult> {
  try {
    if (slug === "staff-availability") {
      const result = await syncAvailabilitySheetToDatabase();
      return {
        slug,
        connected: result.connected,
        region: result.config.region,
        sourceName: result.config.sourceName,
        cachedRows: result.cachedRows,
        staffCount: result.feed.staff.length
      };
    }

    const result = await syncInductionSheetToDatabase();
    return {
      slug,
      connected: result.connected,
      region: result.config.region,
      sourceName: result.config.sourceName,
      cachedRows: result.cachedRows,
      staffCount: result.feed.staff.length,
      siteCount: result.feed.sites.length
    };
  } catch (error) {
    return {
      slug,
      connected: false,
      region: "",
      sourceName: "",
      cachedRows: 0,
      error: error instanceof Error ? error.message : "Sheet sync failed."
    };
  }
}

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;
  const paused = await blockOdinWriteIfOverwatchPaused(permission);
  if (paused) return paused;

  const body = await request.json().catch(() => ({}));
  const requestedSlug = typeof body.slug === "string" ? body.slug : "";
  const slugs: SheetSourceSlug[] = isSheetSourceSlug(requestedSlug)
    ? [requestedSlug]
    : ["staff-availability", "inductions"];
  const results = await Promise.all(slugs.map(syncOne));

  await logTocAudit({
    actor: permission.user,
    action: permission.kind === "odin" ? "odin.sheet_cache.refresh" : "admin.sheet_cache.refresh",
    entityTable: "app_settings",
    details: { requestedSlug: requestedSlug || "all", results }
  });

  return NextResponse.json({
    connected: results.every((result) => !result.error),
    syncedAt: new Date().toISOString(),
    results
  }, { status: results.some((result) => result.error) ? 207 : 200 });
}
