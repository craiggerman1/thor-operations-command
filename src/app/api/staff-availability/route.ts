import { NextResponse } from "next/server";
import { readCachedAvailabilityFeed, readSheetSourceConfig, scopedEmptyAvailabilityFeed, syncAvailabilitySheetToDatabase } from "@/lib/sheet-feed-sync";
import { requireTocScope } from "@/lib/toc-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const requestedScope = searchParams.get("scope") || "National";
  const forceRefresh = searchParams.has("refresh") && searchParams.get("refresh") !== "false";
  const scopePermission = await requireTocScope(request, requestedScope);
  if (scopePermission.error) return scopePermission.error;

  const config = await readSheetSourceConfig("staff-availability", scopePermission.scope);
  if (!forceRefresh) {
    const cachedFeed = await readCachedAvailabilityFeed(scopePermission.scope, config);
    if (cachedFeed?.staff.length) return NextResponse.json(cachedFeed);
  }

  if (!config.connected || scopePermission.scope !== config.region) {
    const cachedFeed = await readCachedAvailabilityFeed(scopePermission.scope, config);
    if (cachedFeed?.staff.length) {
      return NextResponse.json(cachedFeed);
    }

    return NextResponse.json(scopedEmptyAvailabilityFeed(scopePermission.scope));
  }

  try {
    const result = await syncAvailabilitySheetToDatabase(config);
    return NextResponse.json(result.feed);
  } catch {
    const cachedFeed = await readCachedAvailabilityFeed(scopePermission.scope, config);
    if (cachedFeed?.staff.length) {
      return NextResponse.json(cachedFeed);
    }

    return NextResponse.json({
      ...scopedEmptyAvailabilityFeed(scopePermission.scope),
      sourceName: config.sourceName || `${scopePermission.scope} availability source unavailable`,
      spreadsheetUrl: config.spreadsheetUrl,
      lastRead: "Source unavailable"
    });
  }
}
