import { NextResponse } from "next/server";
import { readCachedInductionFeed, readSheetSourceConfig, scopedEmptyInductionFeed, syncInductionSheetToDatabase } from "@/lib/sheet-feed-sync";
import { requireTocScope } from "@/lib/toc-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const requestedScope = searchParams.get("scope") || "National";
  const forceRefresh = searchParams.get("refresh") === "true";
  const scopePermission = await requireTocScope(request, requestedScope);
  if (scopePermission.error) return scopePermission.error;

  const config = await readSheetSourceConfig("inductions", scopePermission.scope);
  if (!forceRefresh) {
    const cachedFeed = await readCachedInductionFeed(scopePermission.scope, config);
    if (cachedFeed?.staff.length) return NextResponse.json(cachedFeed);
  }

  if (!config.connected || scopePermission.scope !== config.region) {
    const cachedFeed = await readCachedInductionFeed(scopePermission.scope, config);
    if (cachedFeed?.staff.length) return NextResponse.json(cachedFeed);

    return NextResponse.json(scopedEmptyInductionFeed(scopePermission.scope));
  }

  try {
    const result = await syncInductionSheetToDatabase(config);
    return NextResponse.json(result.feed);
  } catch {
    const cachedFeed = await readCachedInductionFeed(scopePermission.scope, config);
    if (cachedFeed?.staff.length) return NextResponse.json(cachedFeed);

    return NextResponse.json({
      ...scopedEmptyInductionFeed(scopePermission.scope),
      sourceName: config.sourceName || `${scopePermission.scope} induction source unavailable`,
      spreadsheetUrl: config.spreadsheetUrl,
      lastRead: "Source unavailable"
    });
  }
}
